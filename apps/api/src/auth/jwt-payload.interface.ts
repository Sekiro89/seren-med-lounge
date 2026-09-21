import type { PatientRole, StaffRole } from '@serenemed/types';

/**
 * Claims embedded in every access token — issued by AuthService.login()
 * (staff, `actorType: 'USER'`) or PatientAuthService.login() (patients,
 * `actorType: 'PATIENT'`). One shared shape for both, discriminated by
 * `actorType`, rather than two parallel token formats — see
 * docs/architecture/security.md#authentication.
 *
 * A real discriminated union (not `role: AppRole` on one flat type) —
 * narrowing on `actorType` then gives TypeScript the actual role type
 * (`StaffRole` vs `PatientRole`), which is what makes
 * `roleHasPermission(user.role, ...)` in PermissionsGuard typecheck
 * without a cast: after `actorType !== 'USER'` is ruled out, `role` is
 * provably `StaffRole`, not just "some AppRole we're hoping is right."
 *
 * `jti` (JWT ID) is what makes single-token revocation possible — see
 * AuthService.logout()/PatientAuthService.logout() and the blacklist
 * check in JwtAuthGuard (shared by both actor types too).
 */
export type JwtPayload =
  | { sub: string; organizationId: string; role: StaffRole; actorType: 'USER'; jti: string }
  | { sub: string; organizationId: string; role: PatientRole; actorType: 'PATIENT'; jti: string };

/**
 * What's actually on the decoded token after verification — `iat`/`exp`
 * are added automatically by @nestjs/jwt at sign time (from
 * `signOptions.expiresIn`), not part of the payload we construct
 * ourselves.
 */
export type VerifiedJwtPayload = JwtPayload & { iat: number; exp: number };

/** Shape of `request.user` after JwtAuthGuard runs — see jwt-auth.guard.ts. */
export type AuthenticatedUser =
  | {
      actorType: 'USER';
      userId: string;
      organizationId: string;
      role: StaffRole;
      jti: string;
      /** Unix seconds — needed by POST /auth/logout to size the blacklist TTL. */
      expiresAt: number;
    }
  | {
      actorType: 'PATIENT';
      userId: string;
      organizationId: string;
      role: PatientRole;
      jti: string;
      expiresAt: number;
    };
