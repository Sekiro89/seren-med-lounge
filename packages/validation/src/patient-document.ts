import { z } from 'zod';

/**
 * Registers metadata for a file already placed in object storage by a
 * future upload flow — this schema doesn't handle the upload itself,
 * see the doc comment on the PatientDocument model for why.
 */
export const registerPatientDocumentSchema = z.object({
  patientId: z.string().min(1),
  documentType: z.enum(['PHOTO', 'ID_PROOF', 'INSURANCE_CARD', 'PAN_CARD', 'OTHER']),
  storageKey: z.string().min(1).max(1000),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
});

export type RegisterPatientDocumentInput = z.infer<typeof registerPatientDocumentSchema>;
