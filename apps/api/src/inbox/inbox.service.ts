import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  ClinicalRecordStatus,
  EncounterStatus,
  ReferralStatus,
  ReferralType,
} from '@prisma/client';
import { StaffRole } from '@serenemed/types';
import { roleHasPermission } from '@serenemed/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { abnormalDirection, type AbnormalDirection } from './reference-range';

const LIMIT = 50;
/** Rows scanned before in-memory filtering (author of the latest version, range parsing). */
const SCAN = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const UNSIGNED = [ClinicalRecordStatus.DRAFT, ClinicalRecordStatus.AI_DRAFT];

const patientSelect = { select: { id: true, firstName: true, lastName: true } } as const;

type InboxPatient = { id: string; firstName: string; lastName: string };

export interface InboxDraft {
  kind: 'note' | 'diagnosis';
  id: string;
  encounterId: string;
  patient: InboxPatient;
  author: { fullName: string };
  createdAt: Date;
  label: string;
}

export interface InboxAbnormalResult {
  id: string;
  labOrderId: string;
  encounterId: string;
  patient: InboxPatient;
  testName: string;
  resultValue: string;
  unit: string | null;
  referenceRange: string | null;
  direction: AbnormalDirection;
  createdAt: Date;
}

export interface InboxReferral {
  id: string;
  encounterId: string;
  patient: InboxPatient;
  reason: string;
  urgency: string;
  from: { fullName: string };
  createdAt: Date;
}

/**
 * "What needs this person" for the staff Today page: unsigned drafts,
 * recent out-of-range lab results and open internal referrals. Read-only
 * and always tenant-scoped; who sees what is decided here from the
 * caller's role, never from client input.
 */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(organizationId: string, userId: string, role: StaffRole, now: Date = new Date()) {
    const seesAllDrafts = roleHasPermission(role, 'clinical-note:sign-off');
    const seesAllResults = role === StaffRole.ADMINISTRATOR;

    return this.prisma.withTenant(organizationId, async (tx) => {
      const openEncounter = { status: { not: EncounterStatus.CLOSED } };

      const [notes, diagnoses] = await Promise.all([
        tx.clinicalNote.findMany({
          where: { status: { in: UNSIGNED }, encounter: openEncounter },
          include: {
            patient: patientSelect,
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              include: { author: { select: { fullName: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: SCAN,
        }),
        tx.diagnosis.findMany({
          where: { status: { in: UNSIGNED }, encounter: openEncounter },
          include: {
            patient: patientSelect,
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              include: { author: { select: { fullName: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: SCAN,
        }),
      ]);

      const drafts: InboxDraft[] = [
        ...notes.flatMap((note) => {
          const latest = note.versions[0];
          if (!latest || (!seesAllDrafts && latest.authorId !== userId)) return [];
          return [
            {
              kind: 'note' as const,
              id: note.id,
              encounterId: note.encounterId,
              patient: note.patient,
              author: { fullName: latest.author.fullName },
              createdAt: note.createdAt,
              label: note.noteType,
            },
          ];
        }),
        ...diagnoses.flatMap((diagnosis) => {
          const latest = diagnosis.versions[0];
          if (!latest || (!seesAllDrafts && latest.authorId !== userId)) return [];
          return [
            {
              kind: 'diagnosis' as const,
              id: diagnosis.id,
              encounterId: diagnosis.encounterId,
              patient: diagnosis.patient,
              author: { fullName: latest.author.fullName },
              createdAt: diagnosis.createdAt,
              label: latest.description,
            },
          ];
        }),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      let patientIds: string[] | undefined;
      if (!seesAllResults) {
        const appointments = await tx.appointment.findMany({
          where: {
            doctorId: userId,
            status: { not: AppointmentStatus.CANCELLED },
            scheduledAt: {
              gte: new Date(now.getTime() - 30 * DAY_MS),
              lt: new Date(now.getTime() + DAY_MS),
            },
          },
          select: { patientId: true },
          distinct: ['patientId'],
        });
        patientIds = appointments.map((a) => a.patientId);
      }

      const results =
        patientIds && patientIds.length === 0
          ? []
          : await tx.labResult.findMany({
              where: {
                createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
                referenceRange: { not: null },
                labOrderItem: {
                  labOrder: patientIds ? { patientId: { in: patientIds } } : {},
                },
              },
              include: {
                labOrderItem: {
                  include: {
                    labOrder: {
                      select: { id: true, encounterId: true, patient: patientSelect },
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: SCAN,
            });

      const abnormalResults: InboxAbnormalResult[] = results.flatMap((result) => {
        const direction = abnormalDirection(result.resultValue, result.referenceRange);
        if (!direction) return [];
        const order = result.labOrderItem.labOrder;
        return [
          {
            id: result.id,
            labOrderId: order.id,
            encounterId: order.encounterId,
            patient: order.patient,
            testName: result.labOrderItem.testName,
            resultValue: result.resultValue,
            unit: result.unit,
            referenceRange: result.referenceRange,
            direction,
            createdAt: result.createdAt,
          },
        ];
      });

      const referralWhere = {
        type: ReferralType.INTERNAL,
        toUserId: userId,
        status: ReferralStatus.OPEN,
      };
      const [referralRows, referralCount] = await Promise.all([
        tx.referral.findMany({
          where: referralWhere,
          include: { patient: patientSelect, referredBy: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
        }),
        tx.referral.count({ where: referralWhere }),
      ]);
      const referrals: InboxReferral[] = referralRows.map((r) => ({
        id: r.id,
        encounterId: r.encounterId,
        patient: r.patient,
        reason: r.reason,
        urgency: r.urgency,
        from: { fullName: r.referredBy.fullName },
        createdAt: r.createdAt,
      }));

      return {
        drafts: drafts.slice(0, LIMIT),
        abnormalResults: abnormalResults.slice(0, LIMIT),
        referrals,
        counts: {
          drafts: drafts.length,
          abnormalResults: abnormalResults.length,
          referrals: referralCount,
        },
      };
    });
  }
}
