import { ApiError } from '@serenemed/api-client';

export interface FollowUpRow {
  id: string;
  type: string;
  status: string;
  dueAt: string;
  notes: string | null;
  appointmentId: string | null;
  patient: { id: string; firstName: string; lastName: string; phone: string };
  assignedTo: { id: string; fullName: string } | null;
}

export interface DoctorOption {
  id: string;
  fullName: string;
}

/** The clinic runs on India time: a datetime-local value is read as IST. */
export function localToIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

/** The server's own message for a 400 or 409, otherwise a plain fallback. */
export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
    const message = (error.body as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}
