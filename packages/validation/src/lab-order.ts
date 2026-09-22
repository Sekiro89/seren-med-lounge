import { z } from 'zod';

/**
 * Same shape as prescription.ts — issued in one step (lab-order:write),
 * no draft/sign-off split. At least one item is required; an order with
 * zero tests isn't a real order.
 */
export const labOrderItemSchema = z.object({
  testName: z.string().min(1).max(200),
  instructions: z.string().max(1000).optional(),
});

export type LabOrderItemInput = z.infer<typeof labOrderItemSchema>;

export const createLabOrderSchema = z.object({
  encounterId: z.string().min(1),
  items: z.array(labOrderItemSchema).min(1),
});

export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

/**
 * resultValue is a plain string, not numeric-only — lab results are
 * often qualitative ("Positive"/"Negative"/"Reactive"), not always a
 * number. Gated separately (lab-result:write), a different permission
 * than the order itself (lab-order:write) — see the doc comment on the
 * LabResult model.
 */
export const recordLabResultSchema = z.object({
  resultValue: z.string().min(1).max(500),
  unit: z.string().max(50).optional(),
  referenceRange: z.string().max(200).optional(),
});

export type RecordLabResultInput = z.infer<typeof recordLabResultSchema>;
