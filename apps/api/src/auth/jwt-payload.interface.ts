import type { StaffRole } from '@serenemed/types';

/**
 * Claims embedded in every access token issued by AuthService.login().
 * `jti` (JWT ID) is what makes single-token revocation possible — see
 * AuthService.logout() and the blacklist check in JwtAuthGuard.
 */
export interface JwtPayload {
  sub: string; // User.id
  organizationId: string;
  role: StaffRole;
  jti: string;
}

/**
 * What's actually on the decoded token after verification — `iat`/`exp`
 * are added automatically by @nestjs/jwt at sign time (from
 * `signOptions.expiresIn`), not part of the payload we construct
 * ourselves in AuthService.login().
 */
export type VerifiedJwtPayload = JwtPayload & { iat: number; exp: number };

/** Shape of `request.user` after JwtAuthGuard runs — see jwt-auth.guard.ts. */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: StaffRole;
  jti: string;
  /** Unix seconds — needed by POST /auth/logout to size the blacklist TTL. */
  expiresAt: number;
}
