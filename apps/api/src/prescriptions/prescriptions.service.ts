import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrescriptionStatus } from '@prisma/client';
import type { CreatePrescriptionInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Deliberately simpler than DiagnosesService/ClinicalNotesService — see
 * the doc comment on the Prescription model. Items are inserted once and
 * never touched again (the database backs that up too — UPDATE/DELETE
 * revoked from the app's own DB role on prescription_items, see
 * prisma/migrations/20260922010000_prescriptions/migration.sql); the
 * only mutation this service ever makes is the prescriptions row's own
 * status field, a lifecycle transition, not a content edit.
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, authorId: string, input: CreatePrescriptionInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }

      const prescription = await tx.prescription.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId: input.encounterId,
          authorId,
          status: PrescriptionStatus.ACTIVE,
          items: {
            create: input.items.map((item) => ({ organizationId, ...item })),
          },
        },
        include: { items: true },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: authorId,
        action: 'prescription.create',
        entityType: 'Prescription',
        entityId: prescription.id,
        metadata: {
          encounterId: input.encounterId,
          patientId: encounter.patientId,
          itemCount: input.items.length,
        },
      });

      return prescription;
    });
  }

  async get(organizationId: string, prescriptionId: string) {
    const prescription = await this.prisma.withTenant(organizationId, (tx) =>
      tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: { items: true },
      }),
    );
    if (!prescription) {
      throw new NotFoundException('Prescription not found.');
    }
    return prescription;
  }

  /**
   * Patient-facing — every prescription regardless of status (ACTIVE or
   * CANCELLED), same reasoning as AppointmentsService.listForPatient: no
   * "not ready to show" state exists here the way DRAFT does for
   * diagnoses.
   */
  async listForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.prescription.findMany({
        where: { patientId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async cancel(organizationId: string, actorId: string, prescriptionId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const prescription = await tx.prescription.findUnique({ where: { id: prescriptionId } });
      if (!prescription) {
        throw new NotFoundException('Prescription not found.');
      }
      if (prescription.status === PrescriptionStatus.CANCELLED) {
        throw new ConflictException('This prescription is already cancelled.');
      }

      const cancelled = await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: PrescriptionStatus.CANCELLED },
        include: { items: true },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'prescription.cancel',
        entityType: 'Prescription',
        entityId: prescriptionId,
        metadata: {},
      });

      return cancelled;
    });
  }
}
