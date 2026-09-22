import { Injectable, NotFoundException } from '@nestjs/common';
import { PatientConsentAction, PatientConsentType } from '@prisma/client';
import type { RecordPatientConsentInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Always INSERTs a new PatientConsent row, never updates one — see the
 * doc comment on the PatientConsent model. "Currently consented" is
 * derived, not stored: the latest row per (patientId, consentType).
 */
@Injectable()
export class PatientConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async record(organizationId: string, recordedById: string, input: RecordPatientConsentInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const { patientId, ...rest } = input;
      const patient = await tx.patient.findUnique({ where: { id: patientId } });
      if (!patient) {
        throw new NotFoundException('Patient not found.');
      }

      const consent = await tx.patientConsent.create({
        data: { organizationId, patientId, recordedById, ...rest },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: recordedById,
        action: 'patient_consent.record',
        entityType: 'PatientConsent',
        entityId: consent.id,
        metadata: { patientId, consentType: input.consentType, action: input.action },
      });

      return consent;
    });
  }

  /**
   * Full append-only history for the patient, plus a `current` map
   * (one GRANTED/REVOKED per type — the latest row for each) so callers
   * don't have to re-derive it from the raw list themselves.
   */
  async getForPatient(organizationId: string, patientId: string) {
    const history = await this.prisma.withTenant(organizationId, (tx) =>
      tx.patientConsent.findMany({
        where: { patientId },
        orderBy: { createdAt: 'asc' },
      }),
    );

    const current: Partial<Record<PatientConsentType, PatientConsentAction>> = {};
    for (const entry of history) {
      current[entry.consentType] = entry.action;
    }

    return { history, current };
  }
}
