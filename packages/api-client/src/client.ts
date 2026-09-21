export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => string | null | undefined;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
  }
}

/**
 * Thin fetch wrapper shared by patient-web and staff-web. Deliberately
 * minimal at this stage — no generated per-resource methods yet, since no
 * domain endpoints exist. Add typed methods here as each backend module
 * ships (e.g. `getPatientTimeline(patientId)`), instead of calling fetch
 * directly from components.
 */
export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.config.getAuthToken?.();
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      throw new ApiError(response.status, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...init, method: 'GET' });
  }

  post<T>(path: string, data?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }
}
