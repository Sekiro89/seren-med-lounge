import { z } from 'zod';

/**
 * organizationId is optional, same as the patient login: a staff member
 * shouldn't have to know an internal id to sign in. The server falls back
 * to the deployment's DEFAULT_ORGANIZATION_ID when it's omitted
 * (AuthController.resolveOrganizationId) and answers 503, never a guess,
 * if that isn't configured either. It's still accepted explicitly so a
 * real multi-clinic resolution (subdomain, org picker) can supply it later
 * without a breaking change; User.email stays unique per
 * (organizationId, email), so the id is what disambiguates there. See
 * docs/architecture/open-questions.md#4 and #10.
 */
export const loginSchema = z.object({
  organizationId: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Patient-facing login — organizationId is optional, unlike staff's
 * loginSchema above. A patient shouldn't have to know an internal
 * organizationId to sign in; the server resolves a default when it's
 * omitted (AuthController.resolveOrganizationId,
 * env.DEFAULT_ORGANIZATION_ID) rather than asking for it in the form.
 * Still accepted explicitly here (not removed) so a smarter resolution
 * (subdomain, custom domain) can pass it later without a breaking schema
 * change.
 */
export const patientLoginSchema = z.object({
  organizationId: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(8),
});

export type PatientLoginInput = z.infer<typeof patientLoginSchema>;
