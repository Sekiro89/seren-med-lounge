import { z } from 'zod';

const soapFields = {
  subjective: z.string().max(5000).optional(),
  objective: z.string().max(5000).optional(),
  assessment: z.string().max(5000).optional(),
  plan: z.string().max(5000).optional(),
};

function requireAtLeastOneNoteField(data: Record<string, unknown>) {
  return ['subjective', 'objective', 'assessment', 'plan'].some(
    (key) => data[key] !== undefined && data[key] !== '',
  );
}

/**
 * SOAP-note shape (subjective/objective/assessment/plan) — used for
 * amendments, where the note (and its encounter) already exist. The
 * initial draft needs `encounterId` too — see
 * createClinicalNoteDraftSchema below. Sign-off doesn't take a body at
 * all — it finalizes whatever the latest draft already says.
 */
export const clinicalNoteContentSchema = z
  .object(soapFields)
  .refine(requireAtLeastOneNoteField, { message: 'At least one note field is required.' });

export type ClinicalNoteContentInput = z.infer<typeof clinicalNoteContentSchema>;

export const createClinicalNoteDraftSchema = z
  .object({ encounterId: z.string().min(1), ...soapFields })
  .refine(requireAtLeastOneNoteField, { message: 'At least one note field is required.' });

export type CreateClinicalNoteDraftInput = z.infer<typeof createClinicalNoteDraftSchema>;
