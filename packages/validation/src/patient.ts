import { z } from 'zod';

/**
 * Minimal patient-registration shape to unblock scaffolding of the
 * registration flow. Expand alongside the Patient domain module —
 * see docs/database/erd.md for the full field set under discussion.
 */
export const patientRegistrationSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().date(),
  phone: z.string().min(7),
  email: z.string().email().optional(),
});

export type PatientRegistrationInput = z.infer<typeof patientRegistrationSchema>;
