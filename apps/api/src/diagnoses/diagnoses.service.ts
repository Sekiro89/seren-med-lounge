import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalRecordStatus } from '@prisma/client';
import type { DiagnosisContentInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Same shape as ClinicalNotesService — see its header comment. Every
 * method here INSERTs a new DiagnosisVersion, never UPDATEs one, and
 * the database itself backs that up (UPDATE/DELETE revoked from the
 * app's own DB role on diagnosis_versions — see
 * prisma/migrations/20260922000000_diagnoses/migration.sql).
 */
@Injectable()
export class DiagnosesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createDraft(
    organizationId: string,
    authorId: string,
    encounterId: string,
    content: DiagnosisContentInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }

      const diagnosis = await tx.diagnosis.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId,
          status: ClinicalRecordStatus.DRAFT,
          currentVersionNumber: 1,
        },
      });

      const version = await tx.diagnosisVersion.create({
        data: {
          organizationId,
          diagnosisId: diagnosis.id,
          versionNumber: 1,
          status: ClinicalRecordStatus.DRAFT,
          authorId,
          ...content,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: authorId,
        action: 'diagnosis.create_draft',
        entityType: 'Diagnosis',
        entityId: diagnosis.id,
        metadata: { encounterId, patientId: encounter.patientId, versionNumber: 1 },
      });

      return { ...diagnosis, status: version.status, versions: [version] };
    });
  }

  async getWithHistory(organizationId: string, diagnosisId: string) {
    const diagnosis = await this.prisma.withTenant(organizationId, (tx) =>
      tx.diagnosis.findUnique({
        where: { id: diagnosisId },
        include: { versions: { orderBy: { versionNumber: 'asc' } } },
      }),
    );
    if (!diagnosis) {
      throw new NotFoundException('Diagnosis not found.');
    }
    return diagnosis;
  }

  /**
   * Finalizes the latest draft — a NEW version row with status
   * FINALIZED, not an update to the draft row. Refuses if the latest
   * version is already FINALIZED or AMENDED (amend() is for corrections
   * after that point).
   */
  async signOff(organizationId: string, signingUserId: string, diagnosisId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const latest = await this.requireLatestVersion(tx, diagnosisId);
      if (
        latest.status === ClinicalRecordStatus.FINALIZED ||
        latest.status === ClinicalRecordStatus.AMENDED
      ) {
        throw new ConflictException(
          'This diagnosis is already finalized. Use the amend action to make a correction.',
        );
      }

      const nextVersionNumber = latest.versionNumber + 1;
      const finalized = await tx.diagnosisVersion.create({
        data: {
          organizationId,
          diagnosisId,
          versionNumber: nextVersionNumber,
          status: ClinicalRecordStatus.FINALIZED,
          icdCode: latest.icdCode,
          description: latest.description,
          authorId: signingUserId,
        },
      });

      await tx.diagnosis.update({
        where: { id: diagnosisId },
        data: { status: ClinicalRecordStatus.FINALIZED, currentVersionNumber: nextVersionNumber },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: signingUserId,
        action: 'diagnosis.sign_off',
        entityType: 'Diagnosis',
        entityId: diagnosisId,
        metadata: { versionNumber: nextVersionNumber },
      });

      return finalized;
    });
  }

  /**
   * Only allowed once the diagnosis is FINALIZED, matching
   * ClinicalNotesService.amend(). Always a new version row; the
   * finalized version it corrects is never touched (and, per the DB
   * grant, cannot be).
   */
  async amend(
    organizationId: string,
    authorId: string,
    diagnosisId: string,
    content: DiagnosisContentInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const latest = await this.requireLatestVersion(tx, diagnosisId);
      if (
        latest.status !== ClinicalRecordStatus.FINALIZED &&
        latest.status !== ClinicalRecordStatus.AMENDED
      ) {
        throw new ConflictException(
          'Only a finalized diagnosis can be amended — sign it off first.',
        );
      }

      const nextVersionNumber = latest.versionNumber + 1;
      const amended = await tx.diagnosisVersion.create({
        data: {
          organizationId,
          diagnosisId,
          versionNumber: nextVersionNumber,
          status: ClinicalRecordStatus.AMENDED,
          authorId,
          ...content,
        },
      });

      await tx.diagnosis.update({
        where: { id: diagnosisId },
        data: { status: ClinicalRecordStatus.AMENDED, currentVersionNumber: nextVersionNumber },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: authorId,
        action: 'diagnosis.amend',
        entityType: 'Diagnosis',
        entityId: diagnosisId,
        metadata: { versionNumber: nextVersionNumber },
      });

      return amended;
    });
  }

  private async requireLatestVersion(tx: ExtendedPrismaClient, diagnosisId: string) {
    const diagnosis = await tx.diagnosis.findUnique({ where: { id: diagnosisId } });
    if (!diagnosis) {
      throw new NotFoundException('Diagnosis not found.');
    }
    const latest = await tx.diagnosisVersion.findUnique({
      where: {
        diagnosisId_versionNumber: { diagnosisId, versionNumber: diagnosis.currentVersionNumber },
      },
    });
    if (!latest) {
      throw new NotFoundException('Diagnosis has no versions.');
    }
    return latest;
  }
}
