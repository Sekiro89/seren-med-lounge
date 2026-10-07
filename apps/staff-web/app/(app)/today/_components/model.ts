'use client';

import { useEffect, useState } from 'react';

/** GET /appointments?date= row (AppointmentsService.listForOrganization). */
export interface AgendaAppointment {
  id: string;
  status: string;
  scheduledAt: string;
  notes: string | null;
  entrySource: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    mrn?: string | null;
    sex?: string | null;
    dateOfBirth: string;
    phone: string;
  };
  encounter: {
    id: string;
    queueEntry: { tokenNumber: number; station: string; status: string } | null;
  } | null;
  doctor: { id: string; fullName: string } | null;
}

/** GET /queue row: used for the entry id (to call), wait times and stage history. */
export interface QueueRow {
  id: string;
  encounterId: string;
  tokenNumber: number;
  station: string;
  status: string;
  waitingSince: string;
  calledAt: string | null;
  history: Array<{ station: string; status: string; at: string }>;
}

export interface Availability {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

export interface InboxPatient {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Inbox {
  drafts: Array<{
    kind: 'note' | 'diagnosis';
    id: string;
    encounterId: string;
    patient: InboxPatient;
    author: { fullName: string };
    createdAt: string;
    label: string;
  }>;
  abnormalResults: Array<{
    id: string;
    labOrderId: string;
    encounterId: string;
    patient: InboxPatient;
    testName: string;
    resultValue: string;
    unit: string | null;
    referenceRange: string | null;
    direction: 'low' | 'high';
    createdAt: string;
  }>;
  referrals: Array<{
    id: string;
    encounterId: string;
    patient: InboxPatient;
    reason: string;
    urgency: string;
    from: { fullName: string };
    createdAt: string;
  }>;
  counts: { drafts: number; abnormalResults: number; referrals: number };
}

export const DOCTOR_STATIONS = ['JUNIOR_DOCTOR', 'SENIOR_DOCTOR'];
const AFTER_DOCTOR = ['LAB', 'BILLING', 'PHARMACY'];

/** Ticks every 30 seconds; the first value comes from the initialiser, never from render. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Minutes since midnight, clinic time (IST), for an instant. */
export function clinicMinutes(at: number | string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const formatToken = (n: number) => String(n).padStart(3, '0');

export function ageYears(dateOfBirth: string, now: number): number {
  const dob = new Date(dateOfBirth);
  const today = new Date(now);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export type Phase =
  'seen' | 'ready' | 'called' | 'consulting' | 'vitals' | 'expected' | 'cancelled' | 'no-show';

export interface AgendaRow {
  appointment: AgendaAppointment;
  queue: QueueRow | undefined;
  phase: Phase;
  /** Minutes waiting at the current desk, while waiting or called. */
  waitMinutes: number | undefined;
}

/**
 * Where a visit is, read from the data that exists: the appointment
 * status, plus the queue token's current desk and its stage history (a
 * token that finished at a doctor desk, or has moved on to lab, billing
 * or pharmacy, has been seen).
 */
export function phaseOf(appointment: AgendaAppointment, queue: QueueRow | undefined): Phase {
  if (appointment.status === 'CANCELLED') return 'cancelled';
  if (appointment.status === 'NO_SHOW') return 'no-show';
  if (appointment.status === 'COMPLETED') return 'seen';
  const entry = queue ?? appointment.encounter?.queueEntry ?? undefined;
  if (!entry) return appointment.encounter ? 'vitals' : 'expected';
  const history = queue?.history ?? [];
  const doneWithDoctor = history.some(
    (h) => DOCTOR_STATIONS.includes(h.station) && h.status === 'COMPLETED',
  );
  if (AFTER_DOCTOR.includes(entry.station) || doneWithDoctor) return 'seen';
  if (DOCTOR_STATIONS.includes(entry.station)) {
    if (entry.status === 'IN_SERVICE') return 'consulting';
    if (entry.status === 'CALLED') return 'called';
    if (entry.status === 'WAITING') return 'ready';
    return 'seen';
  }
  return 'vitals';
}

export const PHASE: Record<
  Phase,
  { label: string; text: string; marker: string; tone: 'neutral' | 'info' | 'warning' | 'success' }
> = {
  seen: { label: 'Seen', text: 'text-fg-subtle', marker: 'bg-fg-subtle', tone: 'neutral' },
  ready: { label: 'Ready', text: 'font-semibold text-primary', marker: 'bg-primary', tone: 'info' },
  called: {
    label: 'Called',
    text: 'font-semibold text-primary',
    marker: 'bg-primary',
    tone: 'info',
  },
  consulting: {
    label: 'In consultation',
    text: 'text-success-fg',
    marker: 'bg-success-fg',
    tone: 'success',
  },
  vitals: { label: 'At vitals', text: 'text-warning-fg', marker: 'bg-warning-fg', tone: 'warning' },
  expected: {
    label: 'Expected',
    text: 'text-fg-subtle',
    marker: 'border border-fg-subtle',
    tone: 'neutral',
  },
  cancelled: { label: 'Cancelled', text: 'text-fg-subtle', marker: 'bg-line', tone: 'neutral' },
  'no-show': { label: 'No show', text: 'text-fg-subtle', marker: 'bg-line', tone: 'neutral' },
};

export function buildRows(
  appointments: AgendaAppointment[] | undefined,
  queue: QueueRow[] | undefined,
  now: number,
): AgendaRow[] {
  const byEncounter = new Map((queue ?? []).map((q) => [q.encounterId, q]));
  return [...(appointments ?? [])]
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((appointment) => {
      const q = appointment.encounter ? byEncounter.get(appointment.encounter.id) : undefined;
      const phase = phaseOf(appointment, q);
      const waiting =
        q && (q.status === 'WAITING' || q.status === 'CALLED') && phase !== 'seen'
          ? Math.max(0, Math.floor((now - new Date(q.waitingSince).getTime()) / 60_000))
          : undefined;
      return { appointment, queue: q, phase, waitMinutes: waiting };
    });
}

/**
 * Minutes from check-in to the first time a doctor called the patient
 * (or until now, for someone still waiting), across today's visits.
 */
export function averageWait(rows: AgendaRow[], now: number): number | undefined {
  const waits: number[] = [];
  for (const row of rows) {
    const history = row.queue?.history;
    if (!history || history.length === 0) continue;
    const start = new Date(history[0]!.at).getTime();
    const called = history.find(
      (h) =>
        DOCTOR_STATIONS.includes(h.station) && (h.status === 'CALLED' || h.status === 'IN_SERVICE'),
    );
    if (called) waits.push((new Date(called.at).getTime() - start) / 60_000);
    else if (row.phase !== 'seen' && row.phase !== 'cancelled') waits.push((now - start) / 60_000);
  }
  if (waits.length === 0) return undefined;
  return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
}

/** Simple out-of-range check for a result on the sheet (the inbox API does the real one). */
export function rangeFlag(value: string, range: string | null): 'Low' | 'High' | undefined {
  if (!range) return undefined;
  const v = /^\s*(-?\d+(?:\.\d+)?)/.exec(value);
  if (!v) return undefined;
  const n = Number(v[1]);
  const between = /^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i.exec(range);
  if (between) {
    if (n < Number(between[1])) return 'Low';
    if (n > Number(between[2])) return 'High';
    return undefined;
  }
  const below = /^\s*<=?\s*(-?\d+(?:\.\d+)?)/.exec(range);
  if (below) return n >= Number(below[1]) ? 'High' : undefined;
  const above = /^\s*>=?\s*(-?\d+(?:\.\d+)?)/.exec(range);
  if (above) return n <= Number(above[1]) ? 'Low' : undefined;
  return undefined;
}
