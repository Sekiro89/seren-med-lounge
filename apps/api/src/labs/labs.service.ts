import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LabOrderStatus } from '@prisma/client';
import type { CreateLabOrderInput, RecordLabResultInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Same shape as PrescriptionsService — see its header comment. Two
 * things are immutable once written (lab_order_items, the ordered
 * tests; lab_results, the reported results — both REVOKE UPDATE/DELETE
 * in prisma/migrations/20260922020000_labs/migration.sql), while
 * lab_orders.status stays a mutable lifecycle field.
 */
@Injectable()
export class LabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createOrder(organizationId: string, authorId: string, input: CreateLabOrderInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }

      const labOrder = await tx.labOrder.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId: input.encounterId,
          authorId,
          status: LabOrderStatus.ORDERED,
          items: {
            create: input.items.map((item) => ({ organizationId, ...item })),
          },
        },
        include: { items: true },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: authorId,
        action: 'lab_order.create',
        entityType: 'LabOrder',
        entityId: labOrder.id,
        metadata: {
          encounterId: input.encounterId,
          patientId: encounter.patientId,
          itemCount: input.items.length,
        },
      });

      return labOrder;
    });
  }

  async getOrder(organizationId: string, labOrderId: string) {
    const labOrder = await this.prisma.withTenant(organizationId, (tx) =>
      tx.labOrder.findUnique({
        where: { id: labOrderId },
        include: { items: { include: { results: true } } },
      }),
    );
    if (!labOrder) {
      throw new NotFoundException('Lab order not found.');
    }
    return labOrder;
  }

  /**
   * Patient-facing — every order and whatever results exist so far
   * (a pending, not-yet-resulted item is shown as such, not hidden;
   * unlike a draft diagnosis, "test ordered, awaiting result" is
   * normal, expected transparency, not premature clinical judgment).
   */
  async listOrdersForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.labOrder.findMany({
        where: { patientId },
        include: { items: { include: { results: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async cancelOrder(organizationId: string, actorId: string, labOrderId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const labOrder = await tx.labOrder.findUnique({ where: { id: labOrderId } });
      if (!labOrder) {
        throw new NotFoundException('Lab order not found.');
      }
      if (labOrder.status === LabOrderStatus.CANCELLED) {
        throw new ConflictException('This lab order is already cancelled.');
      }

      const cancelled = await tx.labOrder.update({
        where: { id: labOrderId },
        data: { status: LabOrderStatus.CANCELLED },
        include: { items: { include: { results: true } } },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'lab_order.cancel',
        entityType: 'LabOrder',
        entityId: labOrderId,
        metadata: {},
      });

      return cancelled;
    });
  }

  /**
   * Always INSERTs a new LabResult row, never updates one — a corrected
   * result is entered again against the same item; the latest by
   * createdAt is the current reading. See the doc comment on the
   * LabResult model in schema.prisma.
   */
  async recordResult(
    organizationId: string,
    enteredById: string,
    labOrderItemId: string,
    input: RecordLabResultInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const item = await tx.labOrderItem.findUnique({ where: { id: labOrderItemId } });
      if (!item) {
        throw new NotFoundException('Lab order item not found.');
      }

      const result = await tx.labResult.create({
        data: {
          organizationId,
          labOrderItemId,
          enteredById,
          ...input,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId: enteredById,
        action: 'lab_result.record',
        entityType: 'LabResult',
        entityId: result.id,
        metadata: { labOrderItemId },
      });

      return result;
    });
  }
}
