import { ApiClient } from '@serenemed/api-client';
import { getStaffToken } from './auth';

export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  getAuthToken: getStaffToken,
});
