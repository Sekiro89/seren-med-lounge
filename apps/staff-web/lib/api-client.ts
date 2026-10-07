import { ApiClient, ApiError } from '@serenemed/api-client';
import { clearStaffSession, getStaffToken } from './auth';

export const SESSION_EXPIRED_KEY = 'serenemed_session_expired';

/**
 * The API issues a single access token and has no refresh endpoint, so a
 * 401 on any authenticated call means the session is over. Clear it and
 * send the user to /login with a notice instead of leaving a broken page.
 * (A 401 from /auth/login itself is just "wrong password" and passes through.)
 */
class StaffApiClient extends ApiClient {
  override async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    try {
      return await super.request<T>(path, init);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        typeof window !== 'undefined' &&
        !path.startsWith('/auth/login') &&
        getStaffToken()
      ) {
        try {
          window.sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
        } catch {
          // storage blocked: the redirect still happens, just without the notice
        }
        clearStaffSession();
        window.location.replace('/login');
      }
      throw error;
    }
  }
}

export const apiClient = new StaffApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  getAuthToken: getStaffToken,
});
