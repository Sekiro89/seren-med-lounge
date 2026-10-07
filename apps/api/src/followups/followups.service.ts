import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CarePlanStatus,
  FollowUpStatus,
  FollowUpType,
  NotificationType,
  StaffRole,
  type FollowUp,
} from '@prisma/client';
import { AppointmentEntrySource } from '@serenemed/types';
import type {
  BookFollowUpInput,
  CreateFollowUpInput,
  EscalateFollowUpInput,
  FollowUpItemInput,
  ResolveFollowUpInput,
} from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { clinicDateString, clinicDayRange } from '../common/clinic-time';
import { NotificationsService } from '../notifications/notifications.service';

const OPEN: FollowUpStatus[] = [FollowUpStatus.PENDING, FollowUpStatus.ESCALATED];

type Resolution = 'done' | 'missed' | 'cancel';

const RESOLUTIONS: Record<Resolution, { to: FollowUpStatus; from: FollowUpStatus[] }> = {
  done: { to: FollowUpStatus.DONE, from: OPEN },
  missed: { to: FollowUpStatus.MISSED, from: [FollowUpStatus.PENDING] },
  cancel: { to: FollowUpStatus.CANCELLED, from: OPEN },
};

/**
 * Post-treatment touchpoints as a staff worklist: `?view=today` /
 * `?view=overdue` is the follow-up desk's queue. Outcomes and escalation
 * notes are clinical free text, so audit metadata carries only ids and
 * status changes. Nothing here messages the patient (no SMS/WhatsApp
 * provider is contracted).
 */
@Injectable()
export class FollowupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly appointmentsService: AppointmentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateFollowUpInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
      if (!patient) {
        throw new NotFoundException('Patient not found.');
      }
      if (input.carePlanId) {
        const plan = await tx.carePlan.findUnique({ where: { id: input.carePlanId } });
        if (!plan || plan.patientId !== patient.id || plan.status !== CarePlanStatus.ACTIVE) {
          throw new BadRequestException(
            "carePlanId must be one of this patient's active care plans.",
          );
        }
      }
      const [followUp] = await this.createManyInTx(
        tx,
        organizationId,
        actorId,
        patient.id,
        input.carePlanId ?? null,
        [input],
      );
      return followUp!;
    });
  }

  /** Shared with CarePlansService (care plan creation, discharge). */
  async createManyInTx(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    patientId: string,
    carePlanId: string | null,
    items: FollowUpItemInput[],
  ): Promise<FollowUp[]> {
    const created: FollowUp[] = [];
    for (const item of items) {
      if (item.assignedToId) {
        await this.assertActiveStaff(tx, item.assignedToId);
      }
      const followUp = await tx.followUp.create({
        data: {
          organizationId,
          patientId,
          carePlanId,
          type: item.type,
          dueAt: new Date(item.dueAt),
          notes: item.notes,
          assignedToId: item.assignedToId,
          createdById: actorId,
        },
      });
      await this.audit(tx, organizationId, actorId, 'follow_up.create', followUp, {
        type: item.type,
        carePlanId,
      });
      created.push(followUp);
    }
    return created;
  }

  async list(
    organizationId: string,
    filter: {
      patientId?: string;
      status?: FollowUpStatus;
      assignedToId?: string;
      view?: 'today' | 'overdue';
    },
  ) {
    const today = clinicDayRange(clinicDateString());
    const dueAt =
      filter.view === 'today'
        ? { gte: today.from, lt: today.to }
        : filter.view === 'overdue'
          ? { lt: today.from }
          : undefined;
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.followUp.findMany({
        where: {
          patientId: filter.patientId,
          assignedToId: filter.assignedToId,
          status: filter.view ? (filter.status ?? { in: OPEN }) : filter.status,
          dueAt,
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          assignedTo: { select: { id: true, fullName: true } },
        },
        orderBy: { dueAt: 'asc' },
        take: 200,
      }),
    );
  }

  async resolve(
    organizationId: string,
    actorId: string,
    followUpId: string,
    resolution: Resolution,
    input: ResolveFollowUpInput,
  ) {
    const rule = RESOLUTIONS[resolution];
    return this.mutate(organizationId, followUpId, rule.from, async (tx, followUp) => {
      const updated = await tx.followUp.update({
        where: { id: followUp.id },
        data: {
          status: rule.to,
          outcome: input.outcome ?? followUp.outcome,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      });
      await this.audit(tx, organizationId, actorId, `follow_up.${resolution}`, followUp, {
        from: followUp.status,
      });
      return updated;
    });
  }

  /** The check-in found a problem: record what, hand it to someone (usually a doctor). */
  async escalate(
    organizationId: string,
    actorId: string,
    followUpId: string,
    input: EscalateFollowUpInput,
  ) {
    return this.mutate(
      organizationId,
      followUpId,
      [FollowUpStatus.PENDING],
      async (tx, followUp) => {
        if (input.assignedToId) {
          await this.assertActiveStaff(tx, input.assignedToId);
        }
        const updated = await tx.followUp.update({
          where: { id: followUp.id },
          data: {
            status: FollowUpStatus.ESCALATED,
            outcome: input.outcome,
            escalatedAt: new Date(),
            assignedToId: input.assignedToId ?? followUp.assignedToId,
          },
        });
        await this.audit(tx, organizationId, actorId, 'follow_up.escalate', followUp, {
          assignedToId: updated.assignedToId,
        });
        // To the assignee, or every senior doctor when nobody is named.
        await this.notificationsService.notifyInTx(tx, organizationId, {
          type: NotificationType.FOLLOW_UP_ESCALATED,
          recipient: updated.assignedToId
            ? { userId: updated.assignedToId }
            : { role: StaffRole.SENIOR_DOCTOR },
          title: 'A follow-up was escalated',
          entityType: 'FollowUp',
          entityId: followUp.id,
        });
        return updated;
      },
    );
  }

  /** Books the review visit through the appointments module, atomically. */
  async book(
    organizationId: string,
    actorId: string,
    followUpId: string,
    input: BookFollowUpInput,
  ) {
    return this.mutate(
      organizationId,
      followUpId,
      [FollowUpStatus.PENDING],
      async (tx, followUp) => {
        if (followUp.type !== FollowUpType.REVIEW_APPOINTMENT) {
          throw new BadRequestException('Only a REVIEW_APPOINTMENT follow-up can be booked.');
        }
        if (followUp.appointmentId) {
          throw new ConflictException('This follow-up already has an appointment.');
        }
        const appointment = await this.appointmentsService.createInTx(tx, organizationId, {
          patientId: followUp.patientId,
          doctorId: input.doctorId,
          clinicId: input.clinicId,
          entrySource: AppointmentEntrySource.RECEPTION_WALK_IN,
          scheduledAt: input.scheduledAt,
          notes: 'Follow-up review',
        });
        const updated = await tx.followUp.update({
          where: { id: followUp.id },
          data: { appointmentId: appointment.id },
          include: { appointment: true },
        });
        await this.audit(tx, organizationId, actorId, 'follow_up.book', followUp, {
          appointmentId: appointment.id,
        });
        return updated;
      },
    );
  }

  /** Cancels a care plan's open follow-ups (CarePlansService.cancel). */
  async cancelOpenForPlan(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    carePlanId: string,
  ) {
    const open = await tx.followUp.findMany({ where: { carePlanId, status: { in: OPEN } } });
    for (const followUp of open) {
      await tx.followUp.update({
        where: { id: followUp.id },
        data: { status: FollowUpStatus.CANCELLED, resolvedById: actorId, resolvedAt: new Date() },
      });
      await this.audit(tx, organizationId, actorId, 'follow_up.cancel', followUp, {
        from: followUp.status,
        reason: 'care_plan_cancelled',
      });
    }
  }

  private async mutate<T>(
    organizationId: string,
    followUpId: string,
    allowed: FollowUpStatus[],
    work: (tx: ExtendedPrismaClient, followUp: FollowUp) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM follow_ups WHERE id = ${followUpId} FOR UPDATE`;
      const followUp = await tx.followUp.findUnique({ where: { id: followUpId } });
      if (!followUp) {
        throw new NotFoundException('Follow-up not found.');
      }
      if (!allowed.includes(followUp.status)) {
        throw new ConflictException(`Not allowed while the follow-up is ${followUp.status}.`);
      }
      return work(tx, followUp);
    });
  }

  private async assertActiveStaff(tx: ExtendedPrismaClient, userId: string) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new BadRequestException('assignedToId must be an active staff member.');
    }
  }

  private audit(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    action: string,
    followUp: FollowUp,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action,
      entityType: 'FollowUp',
      entityId: followUp.id,
      metadata: { patientId: followUp.patientId, ...metadata },
    });
  }
}
