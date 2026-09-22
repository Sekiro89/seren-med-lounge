import { z } from 'zod';

/**
 * Unlike clinical-note.ts/diagnosis.ts, no separate draft-vs-amend split
 * — a prescription is issued in one step (see the doc comment on the
 * Prescription model). At least one item is required; a prescription
 * with zero medications isn't a real prescription.
 */
export const prescriptionItemSchema = z.object({
  medicationName: z.string().min(1).max(200),
  dosage: z.string().min(1).max(100),
  frequency: z.string().min(1).max(100),
  durationDays: z.number().int().min(1).max(365).optional(),
  instructions: z.string().max(1000).optional(),
});

export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;

export const createPrescriptionSchema = z.object({
  encounterId: z.string().min(1),
  items: z.array(prescriptionItemSchema).min(1),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
