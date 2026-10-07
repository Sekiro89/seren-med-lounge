import { ApiError } from '@serenemed/api-client';
import type { Tone } from '../../../../lib/status';

export type ProcedureStatus = 'PLANNED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ChecklistItem {
  id: string;
  label: string;
  completedAt: string | null;
}

export interface OperativeNote {
  id: string;
  noteType: string;
  status: string;
  createdAt: string;
  versions: {
    versionNumber: number;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  }[];
}

export interface ProcedureRow {
  id: string;
  kind: 'PROCEDURE' | 'SURGERY';
  name: string;
  status: ProcedureStatus;
  notes: string | null;
  estimateMinor: number | null;
  scheduledAt: string | null;
  location: string | null;
  consentDocumentId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  patientId: string;
  encounterId: string;
  patient: { id: string; firstName: string; lastName: string };
  performedBy: { id: string; fullName: string } | null;
  checklist: ChecklistItem[];
}

export interface ProcedureDetail extends ProcedureRow {
  clinicalNotes: OperativeNote[];
}

export interface DoctorOption {
  id: string;
  fullName: string;
}

export const STATUS_TONE: Record<ProcedureStatus, Tone> = {
  PLANNED: 'neutral',
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

/** The clinic runs on India time: a datetime-local value is read as IST. */
export function localToIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

/** An ISO instant as an IST datetime-local value. */
export function isoToLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);
}

/** The server's own message for a 400, 403 or 409, otherwise a plain fallback. */
export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError && [400, 403, 409].includes(error.status)) {
    const message = (error.body as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}

export function rupeesToPaise(rupees: string): number | undefined {
  if (!rupees.trim()) return undefined;
  const value = Number(rupees);
  if (!Number.isFinite(value) || value < 0) return NaN;
  return Math.round(value * 100);
}
