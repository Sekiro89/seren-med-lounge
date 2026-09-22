import { z } from 'zod';

/**
 * Minimal patient-registration shape to unblock scaffolding of the
 * registration flow. Expand alongside the Patient domain module —
 * see docs/database/erd.md for the full field set under discussion.
 *
 * This is the STAFF-driven flow (POST /patients) — no password, since
 * front-desk registration doesn't set patient portal credentials. See
 * patientSignupSchema below for the patient-driven equivalent.
 */
export const patientRegistrationSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().date(),
  phone: z.string().min(7),
  email: z.string().email().optional(),
});

export type PatientRegistrationInput = z.infer<typeof patientRegistrationSchema>;

/**
 * Patient self-signup (POST /auth/patient/signup) — email and a
 * password are both required here (unlike patientRegistrationSchema's
 * optional email), since this account needs to be able to log itself
 * back in. organizationId is optional for the same reason as
 * patientLoginSchema's — see that schema's comment in
 * @serenemed/validation's auth.ts.
 */
export const patientSignupSchema = z.object({
  organizationId: z.string().min(1).optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().date(),
  phone: z.string().min(7),
  email: z.string().email(),
  password: z.string().min(8),
});

export type PatientSignupInput = z.infer<typeof patientSignupSchema>;
