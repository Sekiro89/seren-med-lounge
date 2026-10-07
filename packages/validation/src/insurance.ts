import { z } from 'zod';

/** Integer minor units (paise) — never a float. */
const minorAmount = z.number().int().nonnegative().max(1_000_000_000);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD.');

export const createInsurancePolicySchema = z
  .object({
    patientId: z.string().min(1),
    insurerName: z.string().min(1).max(200),
    tpaName: z.string().min(1).max(200).optional(),
    policyNumber: z.string().min(1).max(100),
    memberId: z.string().min(1).max(100).optional(),
    sumInsuredMinor: minorAmount.optional(),
    validFrom: dateOnly.optional(),
    validTo: dateOnly.optional(),
    cardDocumentId: z.string().min(1).optional(),
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validFrom <= v.validTo, {
    message: 'validFrom must be on or before validTo.',
  });

export type CreateInsurancePolicyInput = z.infer<typeof createInsurancePolicySchema>;

export const createInsuranceCaseSchema = z.object({
  policyId: z.string().min(1),
  encounterId: z.string().min(1).optional(),
  procedureId: z.string().min(1).optional(),
  invoiceId: z.string().min(1).optional(),
  requestedAmountMinor: minorAmount.optional(),
});

export type CreateInsuranceCaseInput = z.infer<typeof createInsuranceCaseSchema>;

/**
 * Statuses reachable through POST /insurance/cases/:id/transition.
 * SETTLED is deliberately absent — it is only reached via /settle, which
 * also records the Payment.
 */
export const insuranceTransitionSchema = z.object({
  toStatus: z.enum([
    'PRE_AUTH_REQUESTED',
    'PRE_AUTH_APPROVED',
    'PRE_AUTH_DENIED',
    'CLAIM_SUBMITTED',
    'CLAIM_APPROVED',
    'CLAIM_PARTIALLY_APPROVED',
    'CLAIM_REJECTED',
    'CLOSED',
  ]),
  amountMinor: minorAmount.optional(),
  reference: z.string().min(1).max(100).optional(),
  note: z.string().min(1).max(4000).optional(),
});

export type InsuranceTransitionInput = z.infer<typeof insuranceTransitionSchema>;

export const insuranceCaseNoteSchema = z.object({
  note: z.string().min(1).max(4000),
});

export type InsuranceCaseNoteInput = z.infer<typeof insuranceCaseNoteSchema>;

export const settleInsuranceCaseSchema = z.object({
  amountMinor: minorAmount.refine((v) => v > 0, 'amountMinor must be positive.'),
  reference: z.string().min(1).max(100).optional(),
});

export type SettleInsuranceCaseInput = z.infer<typeof settleInsuranceCaseSchema>;
