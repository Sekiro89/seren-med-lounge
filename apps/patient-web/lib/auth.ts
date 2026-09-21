/**
 * Single source of truth for the localStorage key holding the patient's
 * access token — lib/api-client.ts's `getAuthToken` reads the same key,
 * kept in sync by importing this constant rather than duplicating the
 * string in two places.
 */
export const PATIENT_TOKEN_KEY = 'serenemed_patient_token';

export function savePatientToken(token: string): void {
  window.localStorage.setItem(PATIENT_TOKEN_KEY, token);
}

export function getPatientToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PATIENT_TOKEN_KEY);
}

export function clearPatientToken(): void {
  window.localStorage.removeItem(PATIENT_TOKEN_KEY);
}
