import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, type PaymentMethod } from '@prisma/client';
import type { IssueRefundInput, RecordPaymentInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../invoices/invoices.service';

/**
 * Staff-recorded payments (money already in hand: CASH/UPI/CARD, plus
 * INSURANCE settlements written by InsuranceService via recordInTx) and
 * refunds. Both tables are append-only (REVOKE UPDATE/DELETE) — a wrong
 * payment is corrected by a Refund, never an edit.
 *
 * Every write holds InvoicesService.lockForUpdate() on the parent
 * invoice for the whole transaction, so concurrent payments/refunds on
 * one invoice serialize; the invoices CHECK constraint (0 <= paidMinor
 * <= totalMinor) is the database-level backstop.
 *
 * No gateway flow lives here: PaymentProvider is still a stub
 * (docs/architecture/integrations.md). When one is contracted, its
 * verified webhook will land here as a new entry point — never by
 * marking a payment received from an unverified callback.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async record(
    organizationId: string,
    actorId: string,
    invoiceId: string,
    input: RecordPaymentInput,
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      this.recordInTx(tx, organizationId, actorId, invoiceId, input),
    );
  }

  /**
   * The body of record(), for callers that already hold a transaction —
   * today the insurance module's settle step, which records a Payment
   * with method INSURANCE in the same transaction as the case update.
   * The billing desk's Zod schema still only admits CASH/UPI/CARD, so
   * INSURANCE can only arrive through this entry point.
   */
  async recordInTx(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    invoiceId: string,
    input: { method: PaymentMethod; amountMinor: number; reference?: string },
  ) {
    const invoice = await this.invoicesService.lockForUpdate(tx, invoiceId);
    if (invoice.status === InvoiceStatus.VOID) {
      throw new ConflictException('This invoice is void.');
    }
    const outstanding = invoice.totalMinor - invoice.paidMinor;
    if (input.amountMinor > outstanding) {
      throw new ConflictException(
        `Payment exceeds the outstanding balance (${outstanding} minor units).`,
      );
    }

    const payment = await tx.payment.create({
      data: {
        organizationId,
        invoiceId,
        method: input.method,
        amountMinor: input.amountMinor,
        reference: input.reference,
        receivedById: actorId,
      },
    });
    const updated = await this.invoicesService.applyPaidAmount(
      tx,
      invoice,
      invoice.paidMinor + input.amountMinor,
    );

    await this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action: 'payment.record',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { invoiceId, method: input.method, amountMinor: input.amountMinor },
    });

    return { payment, invoice: updated };
  }

  async refund(
    organizationId: string,
    actorId: string,
    paymentId: string,
    input: IssueRefundInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new NotFoundException('Payment not found.');
      }
      // Lock first, then sum: a concurrent refund of the same payment
      // waits here and sees this one's row once it commits.
      const invoice = await this.invoicesService.lockForUpdate(tx, payment.invoiceId);
      const { _sum } = await tx.refund.aggregate({
        where: { paymentId },
        _sum: { amountMinor: true },
      });
      const refundable = payment.amountMinor - (_sum.amountMinor ?? 0);
      if (input.amountMinor > refundable) {
        throw new ConflictException(
          `Refund exceeds the refundable amount on this payment (${refundable} minor units).`,
        );
      }

      const refund = await tx.refund.create({
        data: {
          organizationId,
          paymentId,
          amountMinor: input.amountMinor,
          reason: input.reason,
          issuedById: actorId,
        },
      });
      const updated = await this.invoicesService.applyPaidAmount(
        tx,
        invoice,
        invoice.paidMinor - input.amountMinor,
      );

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'refund.issue',
        entityType: 'Refund',
        entityId: refund.id,
        metadata: { paymentId, invoiceId: invoice.id, amountMinor: input.amountMinor },
      });

      return { refund, invoice: updated };
    });
  }
}
