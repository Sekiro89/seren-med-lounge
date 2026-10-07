import { ApiClient, ApiError } from '@serenemed/api-client';
import { getPatientToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Single shared API client instance for patient-web. Server Components and
 * Route Handlers should still prefer direct server-to-server calls where
 * appropriate; this instance is for client-side data fetching (TanStack
 * Query hooks in features/*).
 */
export const apiClient = new ApiClient({
  baseUrl: BASE_URL,
  getAuthToken: getPatientToken,
});

/**
 * A file the API streams behind the bearer token (a plain link cannot
 * carry the token), as a Blob the caller shows or saves.
 */
export async function fetchFile(path: string): Promise<Blob> {
  const token = getPatientToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.json().catch(() => undefined));
  }
  return response.blob();
}
