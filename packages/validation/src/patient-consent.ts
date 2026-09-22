import { z } from 'zod';

export const recordPatientConsentSchema = z.object({
  patientId: z.string().min(1),
  consentType: z.enum([
    'TREATMENT',
    'DATA_SHARING',
    'AI_CONSULT_RECORDING',
    'MARKETING_COMMUNICATION',
  ]),
  action: z.enum(['GRANTED', 'REVOKED']),
});

export type RecordPatientConsentInput = z.infer<typeof recordPatientConsentSchema>;
