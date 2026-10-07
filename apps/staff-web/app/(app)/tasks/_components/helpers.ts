import { ApiError } from '@serenemed/api-client';
import { formatDate, formatTime } from '../../../../lib/format';
import { clinicToday } from '../../../../lib/format';

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  assignee: { id: string; fullName: string };
  createdBy: { id: string; fullName: string };
  patient: { id: string; firstName: string; lastName: string } | null;
}

export const isPending = (status: string) => status === 'OPEN' || status === 'IN_PROGRESS';

/** The clinic runs on India time: a datetime-local value is read as IST. */
export function localToIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
    const message = (error.body as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}

function clinicDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
}

/** "Due today 15:00", "Due tomorrow 09:30", "Overdue by 2 days". */
export function dueLabel(
  dueAt: string,
  status: string,
  now: number,
): { text: string; overdue: boolean } {
  const diff = dayNumber(clinicDay(dueAt)) - dayNumber(clinicToday());
  const time = formatTime(dueAt);
  const late = isPending(status) && new Date(dueAt).getTime() < now;
  if (late) {
    if (diff === 0) return { text: `Overdue since ${time}`, overdue: true };
    const days = Math.abs(diff);
    return { text: `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`, overdue: true };
  }
  if (diff === 0) return { text: `Due today ${time}`, overdue: false };
  if (diff === 1) return { text: `Due tomorrow ${time}`, overdue: false };
  return { text: `Due ${formatDate(dueAt)} ${time}`, overdue: false };
}
