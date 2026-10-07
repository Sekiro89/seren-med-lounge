import { z } from 'zod';

export const reviewStageSchema = z.enum([
  'AFTER_SECOND_CONSULTATION',
  'AFTER_FIRST_FOLLOW_UP',
  'AFTER_PROCEDURE',
]);

export const createReviewRequestSchema = z
  .object({
    patientId: z.string().min(1),
    stage: reviewStageSchema,
    procedureId: z.string().min(1).optional(),
  })
  .refine((v) => v.stage !== 'AFTER_PROCEDURE' || v.procedureId, {
    message: 'An AFTER_PROCEDURE request needs procedureId.',
  })
  .refine((v) => v.stage === 'AFTER_PROCEDURE' || !v.procedureId, {
    message: 'procedureId is only allowed for AFTER_PROCEDURE.',
  });

export type CreateReviewRequestInput = z.infer<typeof createReviewRequestSchema>;

export const submitReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(5000).optional(),
    format: z.enum(['TEXT', 'VIDEO']).default('TEXT'),
    videoStorageKey: z.string().min(1).max(500).optional(),
    publishConsent: z.boolean(),
  })
  .refine((v) => v.format !== 'VIDEO' || v.videoStorageKey, {
    message: 'A VIDEO review needs videoStorageKey.',
  })
  .refine((v) => v.format === 'VIDEO' || !v.videoStorageKey, {
    message: 'videoStorageKey is only allowed for a VIDEO review.',
  });

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
