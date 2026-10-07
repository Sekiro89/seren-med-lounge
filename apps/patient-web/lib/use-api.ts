'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from './api-client';
import { clearPatientToken } from './auth';

export interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/**
 * GET a `/patients/me/...` path. A 401 means the sign-in has expired, so
 * the token is cleared and the patient is sent to sign in again with a
 * short explanation instead of a broken page.
 */
export function useApi<T>(path: string, pollMs?: number): ApiState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearPatientToken();
          router.replace('/login?expired=1');
          return;
        }
        setError(
          e instanceof ApiError
            ? 'We could not load this just now.'
            : 'You seem to be offline. Check your connection.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick, router]);

  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

/** The current time, refreshed every minute (render must stay pure). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
