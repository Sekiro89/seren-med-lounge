import { z } from 'zod';

/**
 * Every amount is an integer in the currency's minor unit (paise for
 * INR) — never a float. Totals are computed server-side from the items;
 * the client never sends a total. See the BILLING note in schema.prisma.
 */
const minorAmount = z.number().int().nonnegative().max(1_000_000_000);

export const invoiceItemSchema = z.object({
  itemType: z.enum(['CONSULTATION', 'PROCEDURE', 'LAB', 'PHARMACY', 'OTHER']),
  description: z.string().min(1).max(300),
  quantity: z.number().int().positive().max(10_000),
  unitPriceMinor: minorAmount,
  taxMinor: minorAmount.optional(),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

/**
 * Either patientId or encounterId must be given — with an encounterId,
 * the patient is taken from the encounter (and must match patientId if
 * both are sent).
 */
export const createInvoiceSchema = z
  .object({
    patientId: z.string().min(1).optional(),
    encounterId: z.string().min(1).optional(),
    items: z.array(invoiceItemSchema).min(1).max(200),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.patientId || v.encounterId, {
    message: 'patientId or encounterId is required.',
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

/**
 * Staff-recorded money already in hand — no gateway method here (the
 * PaymentProvider is still a stub). `reference` is a UPI transaction id
 * or card slip number; never a card number.
 */
export const recordPaymentSchema = z.object({
  method: z.enum(['CASH', 'UPI', 'CARD']),
  amountMinor: minorAmount.refine((v) => v > 0, 'amountMinor must be positive.'),
  reference: z.string().max(100).optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const issueRefundSchema = z.object({
  amountMinor: minorAmount.refine((v) => v > 0, 'amountMinor must be positive.'),
  reason: z.string().min(1).max(500),
});

export type IssueRefundInput = z.infer<typeof issueRefundSchema>;
