import type { StaffRole } from '@serenemed/types';

/**
 * Single source of truth for the localStorage keys holding the staff
 * session — lib/api-client.ts's `getAuthToken` reads the same token key,
 * kept in sync by importing this module rather than duplicating the
 * string in two places. Mirrors patient-web/lib/auth.ts's shape.
 */
export const STAFF_TOKEN_KEY = 'serenemed_staff_token';
const STAFF_USER_KEY = 'serenemed_staff_user';

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  organizationId: string;
}

export function saveStaffSession(token: string, user: StaffUser): void {
  window.localStorage.setItem(STAFF_TOKEN_KEY, token);
  window.localStorage.setItem(STAFF_USER_KEY, JSON.stringify(user));
}

export function getStaffToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STAFF_TOKEN_KEY);
}

/**
 * Read from what login already returned, not decoded from the JWT — the
 * token is opaque to the frontend by design (`can()` in lib/permissions.ts
 * only controls rendering; the backend re-checks every request).
 */
export function getStaffUser(): StaffUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STAFF_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffUser;
  } catch {
    return null;
  }
}

export function clearStaffSession(): void {
  window.localStorage.removeItem(STAFF_TOKEN_KEY);
  window.localStorage.removeItem(STAFF_USER_KEY);
}
