import { ApiError } from '@serenemed/api-client';
import type { IntegrationView } from '@serenemed/validation';
import type { Tone } from '../../../../lib/status';

/** One mapping from a connection's state to its badge. Nothing is ever tested, so no "verified". */
export function connectionStatus(view: IntegrationView | undefined): {
  label: string;
  tone: Tone;
} {
  if (view?.enabled) return { label: 'Connected', tone: 'success' };
  if (view?.configured) return { label: 'Saved, switched off', tone: 'info' };
  return { label: 'Not connected', tone: 'neutral' };
}

/** The message the server sent (400/409 carry a readable one), else a fallback. */
export function serverMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const message = (error.body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}

export function whenText(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${day} at ${time}`;
}
