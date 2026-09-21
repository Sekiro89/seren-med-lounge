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
