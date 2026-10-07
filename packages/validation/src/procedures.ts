import { z } from 'zod';

export const createReferralSchema = z
  .object({
    encounterId: z.string().min(1),
    type: z.enum(['INTERNAL', 'EXTERNAL']),
    toUserId: z.string().min(1).optional(),
    toName: z.string().max(200).optional(),
    toFacility: z.string().max(200).optional(),
    toSpecialty: z.string().max(200).optional(),
    reason: z.string().min(1).max(2000),
    urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).optional(),
  })
  .refine((v) => v.type !== 'INTERNAL' || v.toUserId, {
    message: 'An INTERNAL referral needs toUserId.',
  })
  .refine((v) => v.type !== 'EXTERNAL' || v.toName || v.toFacility, {
    message: 'An EXTERNAL referral needs toName or toFacility.',
  });

export type CreateReferralInput = z.infer<typeof createReferralSchema>;

export const closeReferralSchema = z.object({
  outcomeNote: z.string().max(2000).optional(),
});

export type CloseReferralInput = z.infer<typeof closeReferralSchema>;

export const createProcedureSchema = z.object({
  encounterId: z.string().min(1),
  kind: z.enum(['PROCEDURE', 'SURGERY']),
  name: z.string().min(1).max(300),
  notes: z.string().max(2000).optional(),
  estimateMinor: z.number().int().nonnegative().max(1_000_000_000).optional(),
  checklist: z.array(z.string().min(1).max(300)).max(50).optional(),
});

export type CreateProcedureInput = z.infer<typeof createProcedureSchema>;

export const scheduleProcedureSchema = z.object({
  scheduledAt: z.string().datetime(),
  performedById: z.string().min(1),
  location: z.string().max(200).optional(),
});

export type ScheduleProcedureInput = z.infer<typeof scheduleProcedureSchema>;

export const procedureEstimateSchema = z.object({
  estimateMinor: z.number().int().nonnegative().max(1_000_000_000),
});

export type ProcedureEstimateInput = z.infer<typeof procedureEstimateSchema>;

export const attachConsentSchema = z.object({ documentId: z.string().min(1) });

export type AttachConsentInput = z.infer<typeof attachConsentSchema>;

export const addChecklistItemSchema = z.object({ label: z.string().min(1).max(300) });

export type AddChecklistItemInput = z.infer<typeof addChecklistItemSchema>;

export const setChecklistItemSchema = z.object({ done: z.boolean() });

export type SetChecklistItemInput = z.infer<typeof setChecklistItemSchema>;

export const cancelProcedureSchema = z.object({ reason: z.string().min(1).max(1000) });

export type CancelProcedureInput = z.infer<typeof cancelProcedureSchema>;
