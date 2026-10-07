import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CarePlanStatus, FollowUpStatus, type CarePlan } from '@prisma/client';
import type { CarePlanBodyInput, CreateCarePlanInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FollowupsService } from '../followups/followups.service';

/**
 * A care plan groups the discharge instructions and the follow-ups that
 * come out of a visit. Created on its own or as part of discharge
 * (EncountersService.discharge -> createInTx).
 */
@Injectable()
export class CarePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly followupsService: FollowupsService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateCarePlanInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
      if (!patient) {
        throw new NotFoundException('Patient not found.');
      }
      if (input.encounterId) {
        const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
        if (!encounter || encounter.patientId !== patient.id) {
          throw new BadRequestException("encounterId must be one of this patient's encounters.");
        }
      }
      return this.createInTx(
        tx,
        organizationId,
        actorId,
        patient.id,
        input.encounterId ?? null,
        input,
      );
    });
  }

  async createInTx(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    patientId: string,
    encounterId: string | null,
    input: CarePlanBodyInput,
  ) {
    const plan = await tx.carePlan.create({
      data: {
        organizationId,
        patientId,
        encounterId,
        title: input.title,
        dischargeInstructions: input.dischargeInstructions,
        createdById: actorId,
      },
    });
    const followUps = await this.followupsService.createManyInTx(
      tx,
      organizationId,
      actorId,
      patientId,
      plan.id,
      input.followUps ?? [],
    );
    await this.audit(tx, organizationId, actorId, 'care_plan.create', plan, {
      encounterId,
      followUpCount: followUps.length,
    });
    return { ...plan, followUps };
  }

  async list(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.carePlan.findMany({
        where: { patientId },
        include: { followUps: { orderBy: { dueAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** Patient-facing: instructions and upcoming touchpoints, without staff outcomes. */
  async listForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.carePlan.findMany({
        where: { patientId, status: { not: CarePlanStatus.CANCELLED } },
        select: {
          id: true,
          title: true,
          dischargeInstructions: true,
          status: true,
          createdAt: true,
          followUps: {
            where: { status: { not: FollowUpStatus.CANCELLED } },
            select: {
              id: true,
              type: true,
              dueAt: true,
              notes: true,
              status: true,
              appointmentId: true,
            },
            orderBy: { dueAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** Only once nothing is still open — finish or cancel the follow-ups first. */
  async complete(organizationId: string, actorId: string, carePlanId: string) {
    return this.mutate(organizationId, carePlanId, async (tx, plan) => {
      const open = await tx.followUp.count({
        where: { carePlanId, status: { in: [FollowUpStatus.PENDING, FollowUpStatus.ESCALATED] } },
      });
      if (open > 0) {
        throw new ConflictException(`${open} follow-up(s) on this plan are still open.`);
      }
      const updated = await tx.carePlan.update({
        where: { id: carePlanId },
        data: { status: CarePlanStatus.COMPLETED, completedAt: new Date() },
      });
      await this.audit(tx, organizationId, actorId, 'care_plan.complete', plan, {});
      return updated;
    });
  }

  /** Cancels the plan and every follow-up on it that's still open. */
  async cancel(organizationId: string, actorId: string, carePlanId: string) {
    return this.mutate(organizationId, carePlanId, async (tx, plan) => {
      await this.followupsService.cancelOpenForPlan(tx, organizationId, actorId, carePlanId);
      const updated = await tx.carePlan.update({
        where: { id: carePlanId },
        data: { status: CarePlanStatus.CANCELLED, cancelledAt: new Date() },
      });
      await this.audit(tx, organizationId, actorId, 'care_plan.cancel', plan, {});
      return updated;
    });
  }

  private async mutate<T>(
    organizationId: string,
    carePlanId: string,
    work: (tx: ExtendedPrismaClient, plan: CarePlan) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM care_plans WHERE id = ${carePlanId} FOR UPDATE`;
      const plan = await tx.carePlan.findUnique({ where: { id: carePlanId } });
      if (!plan) {
        throw new NotFoundException('Care plan not found.');
      }
      if (plan.status !== CarePlanStatus.ACTIVE) {
        throw new ConflictException(`This care plan is already ${plan.status}.`);
      }
      return work(tx, plan);
    });
  }

  private audit(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    action: string,
    plan: CarePlan,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action,
      entityType: 'CarePlan',
      entityId: plan.id,
      metadata: { patientId: plan.patientId, ...metadata },
    });
  }
}
