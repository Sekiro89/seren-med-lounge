import type { StaffRole } from '@serenemed/types';

/** Claims embedded in every access token issued by AuthService.login(). */
export interface JwtPayload {
  sub: string; // User.id
  organizationId: string;
  role: StaffRole;
}

/** Shape of `request.user` after JwtAuthGuard runs — see jwt-auth.guard.ts. */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: StaffRole;
}
