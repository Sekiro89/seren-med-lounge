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

/**
 * noteType defaults to CONSULTATION. OPERATIVE (OT notes) and
 * DISCHARGE_SUMMARY use the same SOAP fields and the same versioning;
 * procedureId links an OT note to the procedure it documents.
 * templateVersionId starts the draft from a clinical template version:
 * any SOAP field not supplied is prefilled from that version's
 * section defaultText.
 */
export const createClinicalNoteDraftSchema = z
  .object({
    encounterId: z.string().min(1),
    noteType: z.enum(['CONSULTATION', 'PROGRESS', 'OPERATIVE', 'DISCHARGE_SUMMARY']).optional(),
    procedureId: z.string().min(1).optional(),
    templateVersionId: z.string().min(1).optional(),
    ...soapFields,
  })
  // A template-based draft may omit every SOAP field — the service
  // prefills them from the template version's defaultText and enforces
  // "at least one field after prefill" itself (400).
  .refine((data) => data.templateVersionId !== undefined || requireAtLeastOneNoteField(data), {
    message: 'At least one note field is required.',
  });

export type CreateClinicalNoteDraftInput = z.infer<typeof createClinicalNoteDraftSchema>;
