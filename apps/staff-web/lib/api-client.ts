import { ApiClient } from '@serenemed/api-client';

export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  getAuthToken: () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('serenemed_staff_token');
  },
});
