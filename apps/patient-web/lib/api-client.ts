import { ApiClient } from '@serenemed/api-client';
import { getPatientToken } from './auth';

/**
 * Single shared API client instance for patient-web. Server Components and
 * Route Handlers should still prefer direct server-to-server calls where
 * appropriate; this instance is for client-side data fetching (TanStack
 * Query hooks in features/*).
 */
export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  getAuthToken: getPatientToken,
});
