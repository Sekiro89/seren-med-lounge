import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, type Invoice } from '@prisma/client';
import type { CreateInvoiceInput, VoidInvoiceInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const INVOICE_DETAIL_INCLUDE = {
  items: true,
  payments: { include: { refunds: true }, orderBy: { createdAt: 'asc' } },
} as const;

/**
 * Same shape as PrescriptionsService/LabsService: invoices.status and
 * paidMinor are a mutable lifecycle, invoice_items are immutable once
 * written (REVOKE UPDATE/DELETE in
 * prisma/migrations/20261007000000_billing/migration.sql). A wrong
 * invoice is voided and reissued, never edited.
 *
 * Payments/refunds live in PaymentsService, which calls
 * lockForUpdate()/applyPaidAmount() below inside its own transaction —
 * this service stays the only writer of the invoices table.
 *
 * Audit metadata carries amounts and counts only, never item
 * descriptions — a line like "HIV test" is medical information.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async issue(organizationId: string, actorId: string, input: CreateInvoiceInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const patientId = await this.resolvePatientId(tx, input);

      const items = input.items.map((item) => {
        const taxMinor = item.taxMinor ?? 0;
        return {
          organizationId,
          itemType: item.itemType,
          description: item.description,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          taxMinor,
          lineTotalMinor: item.quantity * item.unitPriceMinor + taxMinor,
        };
      });
      const subtotalMinor = items.reduce((sum, i) => sum + i.quantity * i.unitPriceMinor, 0);
      const taxMinor = items.reduce((sum, i) => sum + i.taxMinor, 0);
      const totalMinor = subtotalMinor + taxMinor;
      if (!Number.isSafeInteger(totalMinor) || totalMinor > 2_147_483_647) {
        throw new BadRequestException('Invoice total is too large.');
      }

      const number = await this.allocateNumber(tx, organizationId);
      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          number,
          patientId,
          encounterId: input.encounterId,
          status: statusFor(0, totalMinor),
          subtotalMinor,
          taxMinor,
          totalMinor,
          notes: input.notes,
          issuedById: actorId,
          items: { create: items },
        },
        include: INVOICE_DETAIL_INCLUDE,
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'invoice.issue',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { patientId, number, itemCount: items.length, totalMinor },
      });

      return invoice;
    });
  }

  async get(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.withTenant(organizationId, (tx) =>
      tx.invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_DETAIL_INCLUDE }),
    );
    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }
    return invoice;
  }

  async list(organizationId: string, filter: { patientId?: string }) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.invoice.findMany({
        where: { patientId: filter.patientId },
        orderBy: { number: 'desc' },
        take: 100,
      }),
    );
  }

  /** Patient-facing — own invoices only; the caller passes the JWT's patient id. */
  async listForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.invoice.findMany({
        where: { patientId },
        include: INVOICE_DETAIL_INCLUDE,
        orderBy: { number: 'desc' },
      }),
    );
  }

  /**
   * Only an invoice with nothing net-paid can be voided — money already
   * received has to be refunded first (PaymentsService.refund), so a
   * void never silently swallows a payment.
   */
  async void(organizationId: string, actorId: string, invoiceId: string, input: VoidInvoiceInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const invoice = await this.lockForUpdate(tx, invoiceId);
      if (invoice.status === InvoiceStatus.VOID) {
        throw new ConflictException('This invoice is already void.');
      }
      if (invoice.paidMinor > 0) {
        throw new ConflictException('Refund the payments on this invoice before voiding it.');
      }

      const voided = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.VOID,
          voidedById: actorId,
          voidedAt: new Date(),
          voidReason: input.reason,
        },
        include: INVOICE_DETAIL_INCLUDE,
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'invoice.void',
        entityType: 'Invoice',
        entityId: invoiceId,
        metadata: { number: invoice.number, totalMinor: invoice.totalMinor },
      });

      return voided;
    });
  }

  /**
   * Row-locks the invoice for the rest of the caller's transaction, so
   * two concurrent payments (or refunds) against one invoice serialize
   * instead of both reading the same paidMinor and overshooting it. The
   * CHECK (paidMinor <= totalMinor) constraint is the backstop.
   */
  async lockForUpdate(tx: ExtendedPrismaClient, invoiceId: string): Promise<Invoice> {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }
    return invoice;
  }

  /** Caller must hold lockForUpdate() on this invoice in the same tx. */
  async applyPaidAmount(tx: ExtendedPrismaClient, invoice: Invoice, paidMinor: number) {
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { paidMinor, status: statusFor(paidMinor, invoice.totalMinor) },
    });
  }

  private async resolvePatientId(
    tx: ExtendedPrismaClient,
    input: CreateInvoiceInput,
  ): Promise<string> {
    if (input.encounterId) {
      const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }
      if (input.patientId && input.patientId !== encounter.patientId) {
        throw new BadRequestException('That encounter belongs to a different patient.');
      }
      return encounter.patientId;
    }

    const patient = await tx.patient.findUnique({ where: { id: input.patientId! } });
    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }
    return patient.id;
  }

  /**
   * Per-organization sequence. The advisory lock serializes concurrent
   * issues within one org so max+1 can't hand out the same number twice;
   * @@unique([organizationId, number]) is the backstop.
   * TODO(compliance): GST numbering rules (prefix, financial-year reset)
   * are undecided — open-questions.md#15.
   */
  private async allocateNumber(tx: ExtendedPrismaClient, organizationId: string) {
    const key = `invoice-number:${organizationId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const { _max } = await tx.invoice.aggregate({
      where: { organizationId },
      _max: { number: true },
    });
    return (_max.number ?? 0) + 1;
  }
}

function statusFor(paidMinor: number, totalMinor: number): InvoiceStatus {
  if (paidMinor >= totalMinor) return InvoiceStatus.PAID;
  if (paidMinor > 0) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.ISSUED;
}
