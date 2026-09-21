import { z } from 'zod';
import { StaffRole } from '@serenemed/types';

/**
 * organizationId/clinicId are NOT part of this schema — a created user
 * always belongs to the authenticated caller's own organization/clinic
 * (read from the request's tenant context), never to one the client
 * supplies. Accepting organizationId from the request body would let a
 * caller create a user in a different tenant than their own. See
 * apps/api/src/users/users.service.ts.
 */
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.nativeEnum(StaffRole),
  clinicId: z.string().min(1).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
