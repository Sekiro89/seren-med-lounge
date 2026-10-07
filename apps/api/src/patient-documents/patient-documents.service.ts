import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { PatientDocumentType } from '@prisma/client';
import type { RegisterPatientDocumentInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface';

/** What the clinic scans or photographs: pictures and PDFs, plus short videos for testimonials. */
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
]);
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface UploadInput {
  patientId: string;
  documentType: PatientDocumentType;
  fileName: string;
  mimeType: string;
  body: Buffer;
}

/**
 * A patient's documents: ID proofs, photos, insurance cards, consent
 * forms, uploaded reports. `upload` stores the bytes through the storage
 * port and registers the row in one go; `register` (metadata only) stays
 * for files that live elsewhere. Rows soft-delete; the file itself is
 * removed from storage at the same time.
 */
@Injectable()
export class PatientDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async upload(organizationId: string, uploadedById: string, input: UploadInput) {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, PDF, MP4 and WebM files are accepted.');
    }
    if (input.body.length === 0) {
      throw new BadRequestException('The file is empty.');
    }
    if (input.body.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('Files must be 25 MB or smaller.');
    }
    return this.prisma.withTenant(organizationId, async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
      if (!patient || patient.deletedAt) {
        throw new NotFoundException('Patient not found.');
      }
      const fileName = safeFileName(input.fileName);
      // The key is a slug (storage back-ends dislike spaces); the readable name stays on the row.
      const slug = fileName.replace(/[^A-Za-z0-9._-]+/g, '_');
      const key = `${organizationId}/${input.patientId}/${randomBytes(12).toString('hex')}-${slug}`;
      await this.storage.put(key, input.body, input.mimeType);
      try {
        const document = await tx.patientDocument.create({
          data: {
            organizationId,
            patientId: input.patientId,
            uploadedById,
            documentType: input.documentType,
            storageKey: key,
            fileName,
            mimeType: input.mimeType,
          },
        });
        await this.auditService.record(tx, organizationId, {
          actorType: 'USER',
          actorId: uploadedById,
          action: 'patient_document.upload',
          entityType: 'PatientDocument',
          entityId: document.id,
          metadata: {
            patientId: input.patientId,
            documentType: input.documentType,
            sizeBytes: input.body.length,
          },
        });
        return document;
      } catch (error) {
        // The row failed, so the file must not stay behind as an orphan.
        await this.storage.delete(key);
        throw error;
      }
    });
  }

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
        include: { uploadedBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /**
   * The file itself. `patientId` set means the caller is that patient and
   * may only open their own; staff pass none and are gated by permission.
   */
  async open(
    organizationId: string,
    documentId: string,
    patientId?: string,
  ): Promise<{ fileName: string; mimeType: string; stream: Readable }> {
    const document = await this.prisma.withTenant(organizationId, (tx) =>
      tx.patientDocument.findUnique({ where: { id: documentId } }),
    );
    if (!document || document.deletedAt || (patientId && document.patientId !== patientId)) {
      throw new NotFoundException('Document not found.');
    }
    return {
      fileName: document.fileName,
      mimeType: document.mimeType,
      stream: await this.storage.getStream(document.storageKey),
    };
  }

  async remove(organizationId: string, actorId: string, documentId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const document = await tx.patientDocument.findUnique({ where: { id: documentId } });
      if (!document || document.deletedAt) {
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
      // Only files this app stored itself; a registered external reference is left alone.
      if (document.storageKey.startsWith(`${organizationId}/`)) {
        await this.storage.delete(document.storageKey);
      }
      return removed;
    });
  }
}

/** Keeps the original name readable but harmless: no paths, no control characters, bounded length. */
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .replace(/[^\w.() -]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned || 'file';
}
