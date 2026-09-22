import { z } from 'zod';

/**
 * Same draft/amend content shape split as clinical-note.ts: sign-off
 * takes no body (finalizes whatever the latest draft already says), so
 * only createDraft/amend need a schema. icdCode is optional — not every
 * clinic codes to ICD-10 day one, but description is always required
 * (an uncoded diagnosis still needs to say what it is).
 */
const diagnosisFields = {
  icdCode: z.string().max(20).optional(),
  description: z.string().min(1).max(2000),
};

export const diagnosisContentSchema = z.object(diagnosisFields);

export type DiagnosisContentInput = z.infer<typeof diagnosisContentSchema>;

export const createDiagnosisDraftSchema = z.object({
  encounterId: z.string().min(1),
  ...diagnosisFields,
});

export type CreateDiagnosisDraftInput = z.infer<typeof createDiagnosisDraftSchema>;
