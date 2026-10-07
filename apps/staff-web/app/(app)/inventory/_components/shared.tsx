'use client';

import type { ReactNode } from 'react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { clinicToday } from '../../../../lib/format';

export interface Medication {
  id: string;
  name: string;
  genericName: string | null;
  form: string;
  strength: string | null;
  unit: string;
  unitPriceMinor: number | null;
  reorderLevel: number | null;
  isActive: boolean;
}

export interface BatchRow {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityReceived: number;
  quantityOnHand: number;
  supplier: string | null;
  medication: { id: string; name: string; strength: string | null; unit: string };
}

export interface LowStockRow extends Medication {
  usableOnHand: number;
}

export interface MovementRow {
  id: string;
  type: string;
  quantityDelta: number;
  reason: string | null;
  createdAt: string;
}

export const EXPIRY_WARNING_DAYS = 30;

/** Whole days from the clinic's today to a YYYY-MM-DD expiry (negative once expired). */
export function daysUntil(expiryIso: string): number {
  const [y, m, d] = expiryIso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = clinicToday().split('-').map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(ty!, tm! - 1, td!)) / 86_400_000);
}

/** Date-only values are formatted in UTC so the day never shifts. */
export function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso.slice(0, 10) + 'T00:00:00Z'));
}

export function medicineLabel(m: { name: string; strength: string | null }): string {
  return m.strength ? `${m.name} ${m.strength}` : m.name;
}

export function ExpiryCell({ iso }: { iso: string }) {
  const days = daysUntil(iso);
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="tabular">{formatExpiry(iso)}</span>
      {days < 0 ? (
        <Badge tone="danger">Expired</Badge>
      ) : days < EXPIRY_WARNING_DAYS ? (
        <Badge tone="warning">{days === 0 ? 'Today' : `${days}d left`}</Badge>
      ) : null}
    </span>
  );
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

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactNode {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 px-5 py-6">
      <p className="text-sm text-danger-fg">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

/** Rupees typed by a person to integer paise; undefined when blank, NaN when invalid. */
export function rupeesToPaise(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
}
