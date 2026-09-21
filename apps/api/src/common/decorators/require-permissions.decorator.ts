import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@serenemed/permissions';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Declares which permissions (see `@serenemed/permissions`) a route
 * requires. Enforced by `PermissionsGuard` — never trust a frontend
 * `can()` check alone, per docs/architecture/security.md.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
