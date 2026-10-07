import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  ClinicalRecordStatus,
  EncounterStatus,
  QueueStatus,
} from '@prisma/client';
import type { DischargeEncounterInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { recordQueueEvent } from '../queue/queue.service';
import { AuditService } from '../audit/audit.service';
import { CarePlansService } from '../care-plans/care-plans.service';

const UNSIGNED: ClinicalRecordStatus[] = [
  ClinicalRecordStatus.DRAFT,
  ClinicalRecordStatus.AI_DRAFT,
];
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly carePlansService: CarePlansService,
  ) {}

  /**
   * Discharge: closes the encounter, completes its appointment and queue
   * token, and (optionally) creates the care plan with its first
   * follow-ups — one transaction. Refused while any clinical note or
   * diagnosis on the visit is still an unsigned draft, so nothing is
   * left half-documented on a closed visit.
   */
  async discharge(
    organizationId: string,
    actorId: string,
    encounterId: string,
    input: DischargeEncounterInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM encounters WHERE id = ${encounterId} FOR UPDATE`;
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }
      if (encounter.status === EncounterStatus.CLOSED) {
        throw new ConflictException('This visit is already discharged.');
      }
      const draftNotes = await tx.clinicalNote.count({
        where: { encounterId, status: { in: UNSIGNED } },
      });
      const draftDiagnoses = await tx.diagnosis.count({
        where: { encounterId, status: { in: UNSIGNED } },
      });
      if (draftNotes + draftDiagnoses > 0) {
        throw new ConflictException(
          `Sign off or remove ${draftNotes} draft note(s) and ${draftDiagnoses} draft diagnosis(es) first.`,
        );
      }

      const closed = await tx.encounter.update({
        where: { id: encounterId },
        data: { status: EncounterStatus.CLOSED, endedAt: new Date() },
      });
      await tx.appointment.update({
        where: { id: encounter.appointmentId },
        data: { status: AppointmentStatus.COMPLETED },
      });
      const openTokens = await tx.queueEntry.findMany({
        where: { encounterId, status: { not: QueueStatus.COMPLETED } },
        select: { id: true },
      });
      for (const token of openTokens) {
        const completed = await tx.queueEntry.update({
          where: { id: token.id },
          data: { status: QueueStatus.COMPLETED, completedAt: new Date() },
        });
        await recordQueueEvent(tx, organizationId, completed, actorId);
      }
      const carePlan = input.carePlan
        ? await this.carePlansService.createInTx(
            tx,
            organizationId,
            actorId,
            encounter.patientId,
            encounterId,
            input.carePlan,
          )
        : null;

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'encounter.discharge',
        entityType: 'Encounter',
        entityId: encounterId,
        metadata: { patientId: encounter.patientId, carePlanId: carePlan?.id ?? null },
      });

      return { encounter: closed, carePlan };
    });
  }

  /**
   * The consultation view: an encounter with its vitals, clinical notes
   * (each note's latest version only — full history is on
   * GET /clinical-notes/:id, not repeated here), diagnoses (same latest-
   * version-only shape), prescriptions (with their immutable items), and
   * lab orders (with their items and any recorded results). Extended
   * from vitals/clinical-notes-only to this full set when the staff-web
   * doctor workspace needed it — see docs/workflows/clinic-journey.md,
   * "patient timeline, previous reports."
   */
  async getDetail(organizationId: string, encounterId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
              sex: true,
              dateOfBirth: true,
              phone: true,
            },
          },
          // The booking reason, in the patient's words.
          appointment: { select: { notes: true, scheduledAt: true } },
          vitals: {
            orderBy: { recordedAt: 'desc' },
            include: { recordedBy: { select: { fullName: true, role: true } } },
          },
          metabolicWorkups: { orderBy: { createdAt: 'desc' } },
          registration: true,
          referrals: { orderBy: { createdAt: 'desc' } },
          procedures: { orderBy: { createdAt: 'desc' } },
          carePlans: { include: { followUps: { orderBy: { dueAt: 'asc' } } } },
          queueEntry: true,
          clinicalNotes: {
            include: {
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
              },
              templateVersion: { select: { version: true, template: { select: { name: true } } } },
            },
          },
          diagnoses: {
            include: {
              versions: {
                orderBy: { versionNumber: 'desc' },
                take: 1,
              },
            },
          },
          prescriptions: {
            include: { items: true },
            orderBy: { createdAt: 'desc' },
          },
          labOrders: {
            include: { items: { include: { results: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }
      const currentMedication = await this.currentMedication(tx, encounter);
      return { ...encounter, currentMedication };
    });
  }

  /**
   * What the patient is taking from earlier visits: items on active
   * prescriptions from other encounters that are still within their
   * course (or have no set duration). This visit's own prescriptions are
   * shown separately, so they are left out.
   */
  private async currentMedication(
    tx: Pick<ExtendedPrismaClient, 'prescription'>,
    encounter: { id: string; patientId: string; startedAt: Date },
  ) {
    const prescriptions = await tx.prescription.findMany({
      where: {
        patientId: encounter.patientId,
        encounterId: { not: encounter.id },
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: { lt: encounter.startedAt },
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const at = encounter.startedAt.getTime();
    const seen = new Set<string>();
    return prescriptions.flatMap((p) =>
      p.items
        .filter((item) => {
          const key = item.medicationName.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return (
            item.durationDays == null || p.createdAt.getTime() + item.durationDays * DAY_MS > at
          );
        })
        .map((item) => ({
          id: item.id,
          medicationName: item.medicationName,
          dosage: item.dosage,
          frequency: item.frequency,
          prescribedAt: p.createdAt,
          encounterId: p.encounterId,
        })),
    );
  }
}
