'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from './api-client';

export interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  /** HTTP status of the failure, if any (403 drives the "no access" state). */
  errorStatus: number | undefined;
  errorMessage: string | undefined;
  reload: () => void;
}

/**
 * GET a path and keep it fresh. `path` null skips the request (a role
 * without the permission never calls the endpoint at all). `pollMs`
 * re-fetches quietly in the background (the queue and notifications use
 * polling until a push channel exists).
 */
export function useApi<T>(path: string | null, pollMs?: number): ApiState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(path !== null);
  const [errorStatus, setErrorStatus] = useState<number>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [tick, setTick] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    if (first.current) setLoading(true);

    apiClient
      .get<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setErrorStatus(undefined);
        setErrorMessage(undefined);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorStatus(error instanceof ApiError ? error.status : 0);
        setErrorMessage(
          error instanceof ApiError ? 'This could not be loaded.' : 'Could not reach the server.',
        );
      })
      .finally(() => {
        if (cancelled) return;
        first.current = false;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  useEffect(() => {
    if (!pollMs || path === null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, path]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, errorStatus, errorMessage, reload };
}
