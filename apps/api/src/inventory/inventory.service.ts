import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import type {
  AdjustStockInput,
  CreateMedicationInput,
  ReceiveStockInput,
} from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { clinicDateString, toDbDate } from '../common/clinic-time';

export interface Allocation {
  batchId: string;
  quantity: number;
}

/**
 * Medication catalogue + batch-level stock. Every quantityOnHand change
 * is paired with an append-only StockMovement row in the same
 * transaction (stock_movements is REVOKE UPDATE/DELETE), and a CHECK
 * keeps quantityOnHand >= 0. Expired batches are never allocated.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createMedication(organizationId: string, actorId: string, input: CreateMedicationInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const medication = await tx.medication.create({ data: { organizationId, ...input } });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'medication.create',
        entityType: 'Medication',
        entityId: medication.id,
        metadata: {},
      });
      return medication;
    });
  }

  async listMedications(organizationId: string, search?: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.medication.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { genericName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );
  }

  async setMedicationActive(
    organizationId: string,
    actorId: string,
    medicationId: string,
    isActive: boolean,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const medication = await tx.medication.findUnique({ where: { id: medicationId } });
      if (!medication) {
        throw new NotFoundException('Medication not found.');
      }
      const updated = await tx.medication.update({
        where: { id: medicationId },
        data: { isActive },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: isActive ? 'medication.activate' : 'medication.deactivate',
        entityType: 'Medication',
        entityId: medicationId,
        metadata: {},
      });
      return updated;
    });
  }

  /**
   * A batch number seen again (a second delivery of the same batch) adds
   * to the existing batch — but only if the expiry matches; a mismatch
   * is almost certainly a data-entry error and is refused.
   */
  async receiveStock(organizationId: string, actorId: string, input: ReceiveStockInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const medication = await tx.medication.findUnique({ where: { id: input.medicationId } });
      if (!medication || medication.deletedAt) {
        throw new NotFoundException('Medication not found.');
      }
      if (input.expiryDate <= clinicDateString()) {
        throw new BadRequestException('This batch has already expired.');
      }

      await tx.$queryRaw`SELECT id FROM stock_batches WHERE "medicationId" = ${input.medicationId} AND "batchNumber" = ${input.batchNumber} FOR UPDATE`;
      const existing = await tx.stockBatch.findUnique({
        where: {
          organizationId_medicationId_batchNumber: {
            organizationId,
            medicationId: input.medicationId,
            batchNumber: input.batchNumber,
          },
        },
      });

      let batch;
      if (existing) {
        if (existing.expiryDate.getTime() !== toDbDate(input.expiryDate).getTime()) {
          throw new ConflictException(
            'This batch number is already on record with a different expiry date.',
          );
        }
        batch = await tx.stockBatch.update({
          where: { id: existing.id },
          data: {
            quantityReceived: { increment: input.quantity },
            quantityOnHand: { increment: input.quantity },
          },
        });
      } else {
        try {
          batch = await tx.stockBatch.create({
            data: {
              organizationId,
              medicationId: input.medicationId,
              batchNumber: input.batchNumber,
              expiryDate: toDbDate(input.expiryDate),
              quantityReceived: input.quantity,
              quantityOnHand: input.quantity,
              unitCostMinor: input.unitCostMinor,
              supplier: input.supplier,
              receivedById: actorId,
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('This batch was just received by someone else; retry.');
          }
          throw error;
        }
      }

      await tx.stockMovement.create({
        data: {
          organizationId,
          batchId: batch.id,
          medicationId: input.medicationId,
          type: StockMovementType.RECEIPT,
          quantityDelta: input.quantity,
          actorId,
        },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'stock.receive',
        entityType: 'StockBatch',
        entityId: batch.id,
        metadata: { medicationId: input.medicationId, quantity: input.quantity },
      });
      return batch;
    });
  }

  async adjustStock(
    organizationId: string,
    actorId: string,
    batchId: string,
    input: AdjustStockInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const batch = await this.lockBatch(tx, batchId);
      if (batch.quantityOnHand + input.quantityDelta < 0) {
        throw new ConflictException(`Only ${batch.quantityOnHand} on hand in this batch.`);
      }
      const updated = await tx.stockBatch.update({
        where: { id: batchId },
        data: { quantityOnHand: { increment: input.quantityDelta } },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
          batchId,
          medicationId: batch.medicationId,
          type: input.type,
          quantityDelta: input.quantityDelta,
          reason: input.reason,
          actorId,
        },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'stock.adjust',
        entityType: 'StockBatch',
        entityId: batchId,
        metadata: { type: input.type, quantityDelta: input.quantityDelta },
      });
      return updated;
    });
  }

  async listBatches(organizationId: string, medicationId?: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.stockBatch.findMany({
        where: { medicationId, quantityOnHand: { gt: 0 } },
        include: { medication: { select: { id: true, name: true, strength: true, unit: true } } },
        orderBy: [{ expiryDate: 'asc' }],
      }),
    );
  }

  /** Batches with stock that expire within `days` (or already have). */
  async listExpiring(organizationId: string, days: number) {
    const cutoff = new Date(toDbDate(clinicDateString()).getTime() + days * 86_400_000);
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.stockBatch.findMany({
        where: { quantityOnHand: { gt: 0 }, expiryDate: { lte: cutoff } },
        include: { medication: { select: { id: true, name: true, strength: true, unit: true } } },
        orderBy: [{ expiryDate: 'asc' }],
      }),
    );
  }

  /** Active medications whose usable (unexpired) stock is at or below reorderLevel. */
  async listLowStock(organizationId: string) {
    const today = toDbDate(clinicDateString());
    return this.prisma.withTenant(organizationId, async (tx) => {
      const medications = await tx.medication.findMany({
        where: { isActive: true, reorderLevel: { not: null } },
      });
      const sums = await tx.stockBatch.groupBy({
        by: ['medicationId'],
        where: { expiryDate: { gte: today } },
        _sum: { quantityOnHand: true },
      });
      const onHand = new Map(sums.map((s) => [s.medicationId, s._sum.quantityOnHand ?? 0]));
      return medications
        .map((m) => ({ ...m, usableOnHand: onHand.get(m.id) ?? 0 }))
        .filter((m) => m.usableOnHand <= m.reorderLevel!);
    });
  }

  async listMovements(organizationId: string, filter: { medicationId?: string; batchId?: string }) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.stockMovement.findMany({
        where: filter,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  /**
   * FEFO allocation inside the caller's transaction: locks this
   * medication's unexpired in-stock batches soonest-expiry first, draws
   * from them in order, and writes one DISPENSE movement per batch used.
   * Throws (rolling back the caller) if usable stock is short.
   */
  async allocateFefo(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    medicationId: string,
    quantity: number,
    dispensingId: string,
  ): Promise<Allocation[]> {
    const today = toDbDate(clinicDateString());
    const batches = await tx.$queryRaw<Array<{ id: string; quantityOnHand: number }>>`
      SELECT id, "quantityOnHand" FROM stock_batches
      WHERE "medicationId" = ${medicationId} AND "quantityOnHand" > 0 AND "expiryDate" >= ${today}
      ORDER BY "expiryDate" ASC, "createdAt" ASC
      FOR UPDATE`;

    const available = batches.reduce((sum, b) => sum + b.quantityOnHand, 0);
    if (available < quantity) {
      throw new ConflictException(`Only ${available} usable units in stock.`);
    }

    const allocations: Allocation[] = [];
    let remaining = quantity;
    for (const batch of batches) {
      if (remaining === 0) break;
      const take = Math.min(remaining, batch.quantityOnHand);
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { quantityOnHand: { decrement: take } },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
          batchId: batch.id,
          medicationId,
          type: StockMovementType.DISPENSE,
          quantityDelta: -take,
          dispensingId,
          actorId,
        },
      });
      allocations.push({ batchId: batch.id, quantity: take });
      remaining -= take;
    }
    return allocations;
  }

  /** Puts a cancelled dispensing's stock back into the batches it came from. */
  async returnDispensing(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    dispensingId: string,
  ) {
    const movements = await tx.stockMovement.findMany({
      where: { dispensingId, type: StockMovementType.DISPENSE },
    });
    for (const movement of movements) {
      await this.lockBatch(tx, movement.batchId);
      await tx.stockBatch.update({
        where: { id: movement.batchId },
        data: { quantityOnHand: { increment: -movement.quantityDelta } },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
          batchId: movement.batchId,
          medicationId: movement.medicationId,
          type: StockMovementType.RETURN,
          quantityDelta: -movement.quantityDelta,
          dispensingId,
          reason: 'Dispensing cancelled',
          actorId,
        },
      });
    }
  }

  private async lockBatch(tx: ExtendedPrismaClient, batchId: string) {
    await tx.$queryRaw`SELECT id FROM stock_batches WHERE id = ${batchId} FOR UPDATE`;
    const batch = await tx.stockBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Stock batch not found.');
    }
    return batch;
  }
}
