import { z } from 'zod';

/**
 * organizationId is required here as a deliberate, documented assumption
 * — see docs/architecture/open-questions.md#10. User.email is unique per
 * (organizationId, email), not globally, so a login request has to say
 * which organization it's logging into; there's no product decision yet
 * on *how* a real UI resolves that (subdomain, org picker, email-domain
 * lookup). Requiring it directly in the request body is the simplest
 * thing that is actually correct, not a guess at the eventual UX.
 */
export const loginSchema = z.object({
  organizationId: z.string().min(1),
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
