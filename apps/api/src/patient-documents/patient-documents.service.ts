import { Injectable, NotFoundException } from '@nestjs/common';
import type { RegisterPatientDocumentInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Ordinary soft-delete pattern (see the doc comment on the
 * PatientDocument model) — this is metadata registration, not a file
 * upload; see that same comment for why no storage client exists here.
 */
@Injectable()
export class PatientDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async register(
    organizationId: string,
    uploadedById: string,
    input: RegisterPatientDocumentInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const { patientId, ...rest } = input;
      const patient = await tx.patient.findUnique({ where: { id: patientId } });
      if (!patient) {
        throw new NotFoundException('Patient not found.');
      }

      const document = await tx.patientDocument.create({
        data: { organizationId, patientId, uploadedById, ...rest },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: uploadedById,
        action: 'patient_document.register',
        entityType: 'PatientDocument',
        entityId: document.id,
        metadata: { patientId, documentType: input.documentType },
      });

      return document;
    });
  }

  async listForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.patientDocument.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async remove(organizationId: string, actorId: string, documentId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const document = await tx.patientDocument.findUnique({ where: { id: documentId } });
      if (!document) {
        throw new NotFoundException('Document not found.');
      }

      const removed = await tx.patientDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient_document.remove',
        entityType: 'PatientDocument',
        entityId: documentId,
        metadata: {},
      });

      return removed;
    });
  }
}
