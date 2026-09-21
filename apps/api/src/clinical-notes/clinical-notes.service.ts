import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalRecordSource, ClinicalRecordStatus } from '@prisma/client';
import type { ClinicalNoteContentInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Proves docs/architecture/security.md's clinical-record-immutability
 * requirement for real: every method here INSERTs a new
 * ClinicalNoteVersion, never UPDATEs one — and the database itself
 * backs that up (UPDATE/DELETE are revoked from the app's own DB role
 * on clinical_note_versions — see
 * prisma/migrations/20260921090000_clinic_journey_spine/migration.sql).
 * There is no method here that could update a version even if a future
 * change to this file tried; the privilege isn't there to use.
 */
@Injectable()
export class ClinicalNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createDraft(
    organizationId: string,
    authorId: string,
    encounterId: string,
    content: ClinicalNoteContentInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }

      const note = await tx.clinicalNote.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId,
          status: ClinicalRecordStatus.DRAFT,
          currentVersionNumber: 1,
        },
      });

      const version = await tx.clinicalNoteVersion.create({
        data: {
          organizationId,
          clinicalNoteId: note.id,
          versionNumber: 1,
          status: ClinicalRecordStatus.DRAFT,
          source: ClinicalRecordSource.MANUAL,
          authorId,
          ...content,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: authorId,
        action: 'clinical_note.create_draft',
        entityType: 'ClinicalNote',
        entityId: note.id,
        metadata: { encounterId, patientId: encounter.patientId, versionNumber: 1 },
      });

      return { ...note, status: version.status, versions: [version] };
    });
  }

  async getWithHistory(organizationId: string, clinicalNoteId: string) {
    const note = await this.prisma.withTenant(organizationId, (tx) =>
      tx.clinicalNote.findUnique({
        where: { id: clinicalNoteId },
        include: { versions: { orderBy: { versionNumber: 'asc' } } },
      }),
    );
    if (!note) {
      throw new NotFoundException('Clinical note not found.');
    }
    return note;
  }

  /**
   * Finalizes the latest draft — a NEW version row with status
   * FINALIZED, not an update to the draft row. Refuses if the latest
   * version is already FINALIZED (that's what amend() is for) or
   * already AMENDED (amend again).
   */
  async signOff(organizationId: string, signingUserId: string, clinicalNoteId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const latest = await this.requireLatestVersion(tx, clinicalNoteId);
      if (
        latest.status === ClinicalRecordStatus.FINALIZED ||
        latest.status === ClinicalRecordStatus.AMENDED
      ) {
        throw new ConflictException(
          'This note is already finalized. Use the amend action to make a correction.',
        );
      }

      const nextVersionNumber = latest.versionNumber + 1;
      const finalized = await tx.clinicalNoteVersion.create({
        data: {
          organizationId,
          clinicalNoteId,
          versionNumber: nextVersionNumber,
          status: ClinicalRecordStatus.FINALIZED,
          source: latest.source,
          subjective: latest.subjective,
          objective: latest.objective,
          assessment: latest.assessment,
          plan: latest.plan,
          authorId: signingUserId,
        },
      });

      await tx.clinicalNote.update({
        where: { id: clinicalNoteId },
        data: { status: ClinicalRecordStatus.FINALIZED, currentVersionNumber: nextVersionNumber },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: signingUserId,
        action: 'clinical_note.sign_off',
        entityType: 'ClinicalNote',
        entityId: clinicalNoteId,
        metadata: { versionNumber: nextVersionNumber },
      });

      return finalized;
    });
  }

  /**
   * Only allowed once the note is FINALIZED — matches the spec's
   * Draft → Reviewed → Finalized → Amendment → new Version lifecycle.
   * Always a new version row with new content; the finalized version it
   * corrects is never touched (and, per the DB grant, cannot be).
   */
  async amend(
    organizationId: string,
    authorId: string,
    clinicalNoteId: string,
    content: ClinicalNoteContentInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const latest = await this.requireLatestVersion(tx, clinicalNoteId);
      if (
        latest.status !== ClinicalRecordStatus.FINALIZED &&
        latest.status !== ClinicalRecordStatus.AMENDED
      ) {
        throw new ConflictException('Only a finalized note can be amended — sign it off first.');
      }

      const nextVersionNumber = latest.versionNumber + 1;
      const amended = await tx.clinicalNoteVersion.create({
        data: {
          organizationId,
          clinicalNoteId,
          versionNumber: nextVersionNumber,
          status: ClinicalRecordStatus.AMENDED,
          source: ClinicalRecordSource.MANUAL,
          authorId,
          ...content,
        },
      });

      await tx.clinicalNote.update({
        where: { id: clinicalNoteId },
        data: { status: ClinicalRecordStatus.AMENDED, currentVersionNumber: nextVersionNumber },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: authorId,
        action: 'clinical_note.amend',
        entityType: 'ClinicalNote',
        entityId: clinicalNoteId,
        metadata: { versionNumber: nextVersionNumber },
      });

      return amended;
    });
  }

  private async requireLatestVersion(tx: ExtendedPrismaClient, clinicalNoteId: string) {
    const note = await tx.clinicalNote.findUnique({ where: { id: clinicalNoteId } });
    if (!note) {
      throw new NotFoundException('Clinical note not found.');
    }
    const latest = await tx.clinicalNoteVersion.findUnique({
      where: {
        clinicalNoteId_versionNumber: { clinicalNoteId, versionNumber: note.currentVersionNumber },
      },
    });
    if (!latest) {
      throw new NotFoundException('Clinical note has no versions.');
    }
    return latest;
  }
}
