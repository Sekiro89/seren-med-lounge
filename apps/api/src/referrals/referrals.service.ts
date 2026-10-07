import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReferralStatus, ReferralType, StaffRole } from '@prisma/client';
import type { CloseReferralInput, CreateReferralInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const DOCTOR_ROLES: StaffRole[] = [StaffRole.JUNIOR_DOCTOR, StaffRole.SENIOR_DOCTOR];

/**
 * Internal referrals go to a doctor in the same organization and show
 * up in their inbox (GET /referrals?mine=true); external ones are a
 * record of where the patient was sent. Audit metadata carries ids and
 * urgency only — the reason is clinical free text.
 */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateReferralInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }
      if (input.type === ReferralType.INTERNAL) {
        const target = await tx.user.findUnique({ where: { id: input.toUserId! } });
        if (!target || !target.isActive || !DOCTOR_ROLES.includes(target.role)) {
          throw new BadRequestException('toUserId must be an active doctor in this organization.');
        }
        if (target.id === actorId) {
          throw new BadRequestException('You cannot refer a patient to yourself.');
        }
      }

      const referral = await tx.referral.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          type: input.type,
          toUserId: input.type === ReferralType.INTERNAL ? input.toUserId : null,
          toName: input.toName,
          toFacility: input.toFacility,
          toSpecialty: input.toSpecialty,
          reason: input.reason,
          urgency: input.urgency,
          referredById: actorId,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'referral.create',
        entityType: 'Referral',
        entityId: referral.id,
        metadata: {
          patientId: encounter.patientId,
          type: input.type,
          urgency: referral.urgency,
          toUserId: referral.toUserId,
        },
      });

      return referral;
    });
  }

  async list(
    organizationId: string,
    filter: { patientId?: string; toUserId?: string; status?: ReferralStatus },
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.referral.findMany({
        where: filter,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          referredBy: { select: { id: true, fullName: true } },
          toUser: { select: { id: true, fullName: true } },
        },
        orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
        take: 200,
      }),
    );
  }

  async close(
    organizationId: string,
    actorId: string,
    referralId: string,
    outcome: 'complete' | 'cancel',
    input: CloseReferralInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const referral = await tx.referral.findUnique({ where: { id: referralId } });
      if (!referral) {
        throw new NotFoundException('Referral not found.');
      }
      if (referral.status !== ReferralStatus.OPEN) {
        throw new ConflictException(`This referral is already ${referral.status}.`);
      }

      const now = new Date();
      const updated = await tx.referral.update({
        where: { id: referralId },
        data:
          outcome === 'complete'
            ? { status: ReferralStatus.COMPLETED, completedAt: now, outcomeNote: input.outcomeNote }
            : {
                status: ReferralStatus.CANCELLED,
                cancelledAt: now,
                outcomeNote: input.outcomeNote,
              },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: `referral.${outcome}`,
        entityType: 'Referral',
        entityId: referralId,
        metadata: { patientId: referral.patientId },
      });

      return updated;
    });
  }
}
