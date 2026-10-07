import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PatientDocumentType, QueueStation } from '@prisma/client';
import type { RegisterVisitInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../queue/queue.service';

/**
 * OPD registration for a checked-in encounter: records the per-visit
 * details and issues the queue token in the same transaction, so a
 * registered visit always has a token and a token always has a
 * registration. Patient identity edits stay with PatientsService; the
 * photo/ID/insurance/PAN files are PatientDocuments.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly queueService: QueueService,
  ) {}

  async register(
    organizationId: string,
    actorId: string,
    encounterId: string,
    input: RegisterVisitInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }
      const existing = await tx.registration.findUnique({ where: { encounterId } });
      if (existing) {
        throw new ConflictException('This visit is already registered.');
      }

      // TODO(product): "ID proof — required" per the OPD registration
      // spec, interpreted as "verified at the desk, or an ID_PROOF
      // document on file for this patient". open-questions.md#16.
      if (input.idProofDocumentId) {
        const document = await tx.patientDocument.findUnique({
          where: { id: input.idProofDocumentId },
        });
        if (
          !document ||
          document.deletedAt ||
          document.patientId !== encounter.patientId ||
          document.documentType !== PatientDocumentType.ID_PROOF
        ) {
          throw new BadRequestException(
            "idProofDocumentId must be this patient's ID_PROOF document.",
          );
        }
      } else if (!input.idProofVerified) {
        throw new BadRequestException(
          'ID proof is required: verify it or attach an ID_PROOF document.',
        );
      }

      const registration = await tx.registration.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId,
          visitType: input.visitType,
          consultationRoute: input.consultationRoute,
          idProofDocumentId: input.idProofDocumentId,
          idProofVerified: input.idProofVerified ?? false,
          cancerScreeningRequired: input.cancerScreeningRequired ?? false,
          notes: input.notes,
          registeredById: actorId,
        },
      });
      const queueEntry = await this.queueService.issueToken(
        tx,
        organizationId,
        encounter,
        QueueStation.VITALS,
      );

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'registration.create',
        entityType: 'Registration',
        entityId: registration.id,
        metadata: {
          encounterId,
          patientId: encounter.patientId,
          visitType: input.visitType,
          consultationRoute: input.consultationRoute,
          tokenNumber: queueEntry.tokenNumber,
        },
      });

      return { registration, queueEntry };
    });
  }

  async get(organizationId: string, encounterId: string) {
    const registration = await this.prisma.withTenant(organizationId, (tx) =>
      tx.registration.findUnique({ where: { encounterId } }),
    );
    if (!registration) {
      throw new NotFoundException('This visit has not been registered.');
    }
    return registration;
  }
}
