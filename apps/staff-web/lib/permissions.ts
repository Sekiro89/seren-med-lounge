import { StaffRole } from '@serenemed/types';
import { roleHasPermission, type Permission } from '@serenemed/permissions';

/**
 * UI-level permission check — controls what renders, nothing more.
 * The backend re-checks every request; see docs/architecture/security.md.
 * "Never rely only on frontend role checks."
 */
export function can(role: StaffRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return roleHasPermission(role, permission);
}
