'use client';

import type { ReactNode } from 'react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../../components/ui/button';
import { HATCH_STYLE, StatusWord } from '../../../../components/ui/ink';
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
  })
    .format(new Date(iso.slice(0, 10) + 'T00:00:00Z'))
    .replace(/\bSept\b/, 'Sep');
}

export function medicineLabel(m: { name: string; strength: string | null }): string {
  return m.strength ? `${m.name} ${m.strength}` : m.name;
}

export function ExpiryCell({ iso }: { iso: string }) {
  const days = daysUntil(iso);
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="tabular font-mono">{formatExpiry(iso)}</span>
      {days < 0 ? (
        <StatusWord tone="danger">Expired</StatusWord>
      ) : days < EXPIRY_WARNING_DAYS ? (
        <StatusWord tone="warning">{days === 0 ? 'Expires today' : `${days}d left`}</StatusWord>
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
    <div role="alert" className="flex items-center justify-between gap-4 px-5 py-6 sm:px-8">
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
    <p role="alert" className="bg-danger-bg px-3 py-2 text-sm text-danger-fg">
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

/** Days shown on the expiry ruler: half a year ahead. */
const EXPIRY_AXIS_DAYS = 180;

/**
 * Shelf life as a ruler (design system 4): a hairline axis from today to
 * six months out, the first 30 days hatched as the warning zone, and a
 * tick where the batch expires (red at the left edge once expired).
 * Decorative; the date and the word sit beside it.
 */
export function ExpiryRuler({ iso }: { iso: string }) {
  const days = daysUntil(iso);
  const pos = (d: number) => `${Math.min(100, Math.max(0, (d / EXPIRY_AXIS_DAYS) * 100))}%`;
  const tone = days < 0 ? 'bg-danger' : days < EXPIRY_WARNING_DAYS ? 'bg-warning-fg' : 'bg-fg';
  return (
    <div aria-hidden="true" className="relative h-3 w-28">
      <div
        className="absolute top-[2px] h-[7px]"
        style={{ left: 0, width: pos(EXPIRY_WARNING_DAYS), ...HATCH_STYLE }}
      />
      <div className="absolute inset-x-0 top-[5px] h-px bg-control" />
      <div
        className={`absolute top-0 h-3 w-[2px] ${tone}`}
        style={{ left: `calc(${pos(days)} - ${days >= EXPIRY_AXIS_DAYS ? 2 : 1}px)` }}
      />
    </div>
  );
}
