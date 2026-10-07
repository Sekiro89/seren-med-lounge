'use client';

import { useEffect, useState } from 'react';
import {
  Flask,
  FirstAidKit,
  Heartbeat,
  Receipt,
  Stethoscope,
  type Icon,
} from '@phosphor-icons/react';
import type { QueueStationKey } from '@serenemed/permissions';

export interface QueueRow {
  id: string;
  encounterId: string;
  tokenNumber: number;
  station: QueueStationKey;
  status: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'SKIPPED';
  waitingSince: string;
  patient: { id: string; firstName: string; lastName: string };
  encounter: { appointment: { doctor: { id: string; fullName: string } | null } | null } | null;
}

export const STATION_LABEL: Record<QueueStationKey, string> = {
  VITALS: 'Vitals',
  JUNIOR_DOCTOR: 'Junior doctor',
  SENIOR_DOCTOR: 'Senior doctor',
  LAB: 'Lab',
  BILLING: 'Billing',
  PHARMACY: 'Pharmacy',
};

export const STATION_ICON: Record<QueueStationKey, Icon> = {
  VITALS: Heartbeat,
  JUNIOR_DOCTOR: Stethoscope,
  SENIOR_DOCTOR: Stethoscope,
  LAB: Flask,
  BILLING: Receipt,
  PHARMACY: FirstAidKit,
};

/** Where each desk usually sends a patient next, best guess first. */
export const SUGGESTED_NEXT: Record<QueueStationKey, QueueStationKey[]> = {
  VITALS: ['JUNIOR_DOCTOR', 'SENIOR_DOCTOR'],
  JUNIOR_DOCTOR: ['SENIOR_DOCTOR', 'LAB', 'BILLING'],
  SENIOR_DOCTOR: ['BILLING', 'LAB', 'PHARMACY'],
  LAB: ['SENIOR_DOCTOR', 'JUNIOR_DOCTOR', 'BILLING'],
  BILLING: ['PHARMACY'],
  PHARMACY: ['BILLING'],
};

/** The page where the work for a token at this station is done. */
export function workHref(row: QueueRow): { href: string; label: string } {
  switch (row.station) {
    case 'LAB':
      return { href: '/labs', label: 'Open labs' };
    case 'BILLING':
      return { href: '/billing', label: 'Open billing' };
    case 'PHARMACY':
      return { href: '/dispensing', label: 'Open dispensing' };
    default:
      return { href: `/encounters/${row.encounterId}`, label: 'Open visit' };
  }
}

export const formatToken = (n: number) => String(n).padStart(3, '0');

/** Minutes waited at the current desk; re-renders every 30 seconds. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function minutesWaiting(row: QueueRow, now: number): number {
  return Math.max(0, Math.floor((now - new Date(row.waitingSince).getTime()) / 60_000));
}

/** "4 min", "1 h 05 min". */
export function formatWait(minutes: number): string {
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Amber after 20 minutes, red after 40 (always beside the word "Waiting" or "Longest wait"). */
export function waitTone(minutes: number): string {
  return minutes >= 40 ? 'text-danger-fg' : minutes >= 20 ? 'text-warning-fg' : 'text-fg';
}

/** "4 min", "1 h 05 min"; amber after 20 minutes, red after 40. */
export function WaitTime({ minutes }: { minutes: number }) {
  const tone = minutes < 20 ? 'text-fg-muted' : waitTone(minutes);
  return (
    <span className={`tabular font-mono text-[13px] font-medium ${tone}`}>
      {formatWait(minutes)}
    </span>
  );
}
