import { z } from 'zod';

const NOTE_TYPES = ['CONSULTATION', 'PROGRESS', 'OPERATIVE', 'DISCHARGE_SUMMARY'] as const;

const templateSectionSchema = z
  .object({
    prompt: z.string().max(1000).optional(),
    defaultText: z.string().max(5000).optional(),
  })
  .strict();

const templateFieldSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'key must be a lowercase slug.'),
    label: z.string().min(1).max(200),
    type: z.enum(['text', 'number', 'select', 'boolean']),
    options: z.array(z.string().min(1).max(200)).max(100).optional(),
    required: z.boolean().optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === 'select') {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'A select field needs at least one option.',
        });
      } else if (new Set(field.options).size !== field.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Select options must be unique.',
        });
      }
    } else if (field.options !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Only select fields take options.',
      });
    }
  });

/**
 * The content of one ClinicalTemplateVersion: per-SOAP-section prompts
 * (shown to the doctor as guidance) and default text (prefilled into a
 * new draft), plus optional structured field definitions. Field VALUES
 * are not yet stored on notes — see ClinicalTemplatesService.
 */
export const clinicalTemplateBodySchema = z
  .object({
    sections: z
      .object({
        subjective: templateSectionSchema.optional(),
        objective: templateSectionSchema.optional(),
        assessment: templateSectionSchema.optional(),
        plan: templateSectionSchema.optional(),
      })
      .strict(),
    fields: z.array(templateFieldSchema).max(50).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    (body.fields ?? []).forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fields', index, 'key'],
          message: `Duplicate field key "${field.key}".`,
        });
      }
      seen.add(field.key);
    });
  });

export type ClinicalTemplateBody = z.infer<typeof clinicalTemplateBodySchema>;

export const createClinicalTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  noteType: z.enum(NOTE_TYPES),
  specialty: z.string().trim().min(1).max(100).optional(),
  body: clinicalTemplateBodySchema,
});

export type CreateClinicalTemplateInput = z.infer<typeof createClinicalTemplateSchema>;

export const createClinicalTemplateVersionSchema = z.object({
  body: clinicalTemplateBodySchema,
});

export type CreateClinicalTemplateVersionInput = z.infer<
  typeof createClinicalTemplateVersionSchema
>;
