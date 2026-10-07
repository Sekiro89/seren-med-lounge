import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MedicalHistoryCategory, MedicalHistoryStatus } from '@prisma/client';
import type {
  CreateMedicalHistoryInput,
  UpdateMedicalHistoryStatusInput,
} from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Patient-level history. Rows are never deleted or re-worded: only
 * `status` changes (RESOLVED, or ENTERED_IN_ERROR for a mistake), each
 * change audited — so what clinicians were told stays reconstructable.
 * A changed description is a new entry. Audit metadata never includes
 * the description itself.
 */
@Injectable()
export class MedicalHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateMedicalHistoryInput) {
    if (input.severity && input.category !== MedicalHistoryCategory.ALLERGY) {
      throw new BadRequestException('severity applies to allergies only.');
    }
    return this.prisma.withTenant(organizationId, async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
      if (!patient) {
        throw new NotFoundException('Patient not found.');
      }

      const entry = await tx.medicalHistoryEntry.create({
        data: { organizationId, ...input, recordedById: actorId },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'medical_history.create',
        entityType: 'MedicalHistoryEntry',
        entityId: entry.id,
        metadata: { patientId: input.patientId, category: input.category },
      });

      return entry;
    });
  }

  /** ENTERED_IN_ERROR rows are hidden unless asked for. */
  async listForPatient(organizationId: string, patientId: string, includeErrors = false) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.medicalHistoryEntry.findMany({
        where: {
          patientId,
          status: includeErrors ? undefined : { not: MedicalHistoryStatus.ENTERED_IN_ERROR },
        },
        orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  }

  async updateStatus(
    organizationId: string,
    actorId: string,
    entryId: string,
    input: UpdateMedicalHistoryStatusInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const entry = await tx.medicalHistoryEntry.findUnique({ where: { id: entryId } });
      if (!entry) {
        throw new NotFoundException('Medical history entry not found.');
      }
      if (entry.status === MedicalHistoryStatus.ENTERED_IN_ERROR) {
        throw new BadRequestException('An entry marked as an error cannot be changed.');
      }

      const updated = await tx.medicalHistoryEntry.update({
        where: { id: entryId },
        data: { status: input.status },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'medical_history.status_change',
        entityType: 'MedicalHistoryEntry',
        entityId: entryId,
        metadata: { patientId: entry.patientId, from: entry.status, to: input.status },
      });

      return updated;
    });
  }
}
