import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DispensingStatus,
  FulfilmentMode,
  PrescriptionStatus,
  type Dispensing,
} from '@prisma/client';
import type { CreateDispensingInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';

type DispensingAction = 'hand-over' | 'dispatch' | 'deliver' | 'cancel';

const TRANSITIONS: Record<
  DispensingAction,
  { from: DispensingStatus; to: DispensingStatus; mode?: FulfilmentMode; stamp: keyof Dispensing }
> = {
  'hand-over': {
    from: DispensingStatus.PREPARED,
    to: DispensingStatus.HANDED_OVER,
    mode: FulfilmentMode.PICKUP,
    stamp: 'handedOverAt',
  },
  dispatch: {
    from: DispensingStatus.PREPARED,
    to: DispensingStatus.OUT_FOR_DELIVERY,
    mode: FulfilmentMode.HOME_DELIVERY,
    stamp: 'dispatchedAt',
  },
  deliver: {
    from: DispensingStatus.OUT_FOR_DELIVERY,
    to: DispensingStatus.DELIVERED,
    mode: FulfilmentMode.HOME_DELIVERY,
    stamp: 'deliveredAt',
  },
  cancel: { from: DispensingStatus.PREPARED, to: DispensingStatus.CANCELLED, stamp: 'cancelledAt' },
};

/**
 * Dispensing against a prescribed line. Creating one allocates stock
 * FEFO in the same transaction (InventoryService.allocateFefo); a
 * cancellation (only before it leaves the pharmacy) returns that exact
 * stock to the batches it came from.
 */
@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * The diagram's "pharmacy ready alert": prescription lines from the
   * last `days` days of still-ACTIVE prescriptions that have no live
   * (non-cancelled) dispensing yet — what the pharmacy should prepare.
   */
  async listPending(organizationId: string, days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.prescriptionItem.findMany({
        where: {
          prescription: { status: PrescriptionStatus.ACTIVE, createdAt: { gte: since } },
          dispensings: { none: { status: { not: DispensingStatus.CANCELLED } } },
        },
        include: {
          prescription: {
            select: {
              id: true,
              encounterId: true,
              createdAt: true,
              patient: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async dispense(organizationId: string, actorId: string, input: CreateDispensingInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const item = await tx.prescriptionItem.findUnique({
        where: { id: input.prescriptionItemId },
        include: { prescription: true },
      });
      if (!item) {
        throw new NotFoundException('Prescription item not found.');
      }
      if (item.prescription.status !== PrescriptionStatus.ACTIVE) {
        throw new ConflictException('This prescription has been cancelled.');
      }
      const medication = await tx.medication.findUnique({ where: { id: input.medicationId } });
      if (!medication || medication.deletedAt) {
        throw new NotFoundException('Medication not found.');
      }
      if (!medication.isActive) {
        throw new BadRequestException('This medication is inactive in the catalogue.');
      }

      const dispensing = await tx.dispensing.create({
        data: {
          organizationId,
          patientId: item.prescription.patientId,
          prescriptionItemId: item.id,
          medicationId: medication.id,
          quantity: input.quantity,
          mode: input.mode,
          deliveryAddress:
            input.mode === FulfilmentMode.HOME_DELIVERY ? input.deliveryAddress : null,
          dispensedById: actorId,
        },
      });
      const allocations = await this.inventoryService.allocateFefo(
        tx,
        organizationId,
        actorId,
        medication.id,
        input.quantity,
        dispensing.id,
      );

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'dispensing.prepare',
        entityType: 'Dispensing',
        entityId: dispensing.id,
        metadata: {
          patientId: dispensing.patientId,
          prescriptionItemId: item.id,
          quantity: input.quantity,
          batches: allocations.length,
        },
      });

      return { ...dispensing, allocations };
    });
  }

  async transition(
    organizationId: string,
    actorId: string,
    dispensingId: string,
    action: DispensingAction,
  ) {
    const rule = TRANSITIONS[action];
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM dispensings WHERE id = ${dispensingId} FOR UPDATE`;
      const dispensing = await tx.dispensing.findUnique({ where: { id: dispensingId } });
      if (!dispensing) {
        throw new NotFoundException('Dispensing not found.');
      }
      if (dispensing.status !== rule.from || (rule.mode && dispensing.mode !== rule.mode)) {
        throw new ConflictException(
          `Cannot ${action} a ${dispensing.mode} dispensing that is ${dispensing.status}.`,
        );
      }

      if (action === 'cancel') {
        await this.inventoryService.returnDispensing(tx, organizationId, actorId, dispensingId);
      }
      const updated = await tx.dispensing.update({
        where: { id: dispensingId },
        data: { status: rule.to, [rule.stamp]: new Date() },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: `dispensing.${action}`,
        entityType: 'Dispensing',
        entityId: dispensingId,
        metadata: { from: dispensing.status, to: rule.to },
      });

      return updated;
    });
  }

  async list(organizationId: string, filter: { patientId?: string; status?: DispensingStatus }) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.dispensing.findMany({
        where: filter,
        include: { medication: { select: { name: true, strength: true, unit: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  /** Patient-facing — own dispensings, without internal stock/batch detail. */
  async listForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.dispensing.findMany({
        where: { patientId },
        select: {
          id: true,
          quantity: true,
          status: true,
          mode: true,
          createdAt: true,
          handedOverAt: true,
          dispatchedAt: true,
          deliveredAt: true,
          medication: { select: { name: true, strength: true, unit: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
}
