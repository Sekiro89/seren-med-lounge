import { z } from 'zod';

export const followUpTypeSchema = z.enum([
  'REVIEW_APPOINTMENT',
  'MEDICATION_REMINDER',
  'RECOVERY_CHECK',
  'REPORT_ALERT',
  'OTHER',
]);

export const followUpItemSchema = z.object({
  type: followUpTypeSchema,
  dueAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  assignedToId: z.string().min(1).optional(),
});

export type FollowUpItemInput = z.infer<typeof followUpItemSchema>;

export const carePlanBodySchema = z.object({
  title: z.string().min(1).max(200),
  dischargeInstructions: z.string().max(5000).optional(),
  followUps: z.array(followUpItemSchema).max(50).optional(),
});

export type CarePlanBodyInput = z.infer<typeof carePlanBodySchema>;

export const createCarePlanSchema = carePlanBodySchema.extend({
  patientId: z.string().min(1),
  encounterId: z.string().min(1).optional(),
});

export type CreateCarePlanInput = z.infer<typeof createCarePlanSchema>;

export const createFollowUpSchema = followUpItemSchema.extend({
  patientId: z.string().min(1),
  carePlanId: z.string().min(1).optional(),
});

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const resolveFollowUpSchema = z.object({
  outcome: z.string().max(2000).optional(),
});

export type ResolveFollowUpInput = z.infer<typeof resolveFollowUpSchema>;

export const escalateFollowUpSchema = z.object({
  outcome: z.string().min(1).max(2000),
  assignedToId: z.string().min(1).optional(),
});

export type EscalateFollowUpInput = z.infer<typeof escalateFollowUpSchema>;

export const bookFollowUpSchema = z.object({
  scheduledAt: z.string().datetime(),
  doctorId: z.string().min(1).optional(),
  clinicId: z.string().min(1).optional(),
});

export type BookFollowUpInput = z.infer<typeof bookFollowUpSchema>;

/** Closing the visit; optionally creates the care plan in the same step. */
export const dischargeEncounterSchema = z.object({
  carePlan: carePlanBodySchema.optional(),
});

export type DischargeEncounterInput = z.infer<typeof dischargeEncounterSchema>;
