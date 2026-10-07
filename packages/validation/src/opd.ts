import { z } from 'zod';

/** OPD registration for one checked-in encounter. */
export const registerVisitSchema = z.object({
  visitType: z.enum(['NEW_CONSULTATION', 'FOLLOW_UP', 'REPORT_REVIEW', 'PROCEDURE']),
  consultationRoute: z.enum(['JUNIOR_ASSESSMENT', 'DIRECT_SENIOR']),
  idProofDocumentId: z.string().min(1).optional(),
  idProofVerified: z.boolean().optional(),
  cancerScreeningRequired: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export type RegisterVisitInput = z.infer<typeof registerVisitSchema>;

export const queueStationSchema = z.enum([
  'VITALS',
  'JUNIOR_DOCTOR',
  'SENIOR_DOCTOR',
  'BILLING',
  'PHARMACY',
  'LAB',
]);

export const moveQueueEntrySchema = z.object({ station: queueStationSchema });

export type MoveQueueEntryInput = z.infer<typeof moveQueueEntrySchema>;

export const createMedicalHistorySchema = z.object({
  patientId: z.string().min(1),
  category: z.enum([
    'ALLERGY',
    'CONDITION',
    'PAST_SURGERY',
    'CURRENT_MEDICATION',
    'FAMILY_HISTORY',
    'SOCIAL_HISTORY',
  ]),
  description: z.string().min(1).max(1000),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE']).optional(),
});

export type CreateMedicalHistoryInput = z.infer<typeof createMedicalHistorySchema>;

export const updateMedicalHistoryStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'RESOLVED', 'ENTERED_IN_ERROR']),
});

export type UpdateMedicalHistoryStatusInput = z.infer<typeof updateMedicalHistoryStatusSchema>;

/**
 * Point-of-care metabolic readings. otherTests holds clinic-specific
 * extras as simple name -> value pairs.
 */
export const recordMetabolicWorkupSchema = z
  .object({
    encounterId: z.string().min(1),
    glucoseMgDl: z.number().min(10).max(1000).optional(),
    glucoseContext: z.enum(['FASTING', 'RANDOM', 'POST_PRANDIAL']).optional(),
    hba1cPercent: z.number().min(2).max(20).optional(),
    totalCholesterolMgDl: z.number().min(20).max(1000).optional(),
    ldlMgDl: z.number().min(5).max(1000).optional(),
    hdlMgDl: z.number().min(5).max(300).optional(),
    triglyceridesMgDl: z.number().min(10).max(5000).optional(),
    bodyFatPercent: z.number().min(1).max(80).optional(),
    muscleMassKg: z.number().min(1).max(200).optional(),
    visceralFatLevel: z.number().min(0).max(60).optional(),
    otherTests: z
      .record(z.string().max(100), z.union([z.string().max(200), z.number()]))
      .optional(),
  })
  .refine(
    (data) =>
      Object.entries(data).some(
        ([key, value]) => key !== 'encounterId' && key !== 'glucoseContext' && value !== undefined,
      ),
    { message: 'At least one reading is required.' },
  )
  .refine((data) => data.glucoseContext === undefined || data.glucoseMgDl !== undefined, {
    message: 'glucoseContext needs a glucoseMgDl reading.',
  });

export type RecordMetabolicWorkupInput = z.infer<typeof recordMetabolicWorkupSchema>;
