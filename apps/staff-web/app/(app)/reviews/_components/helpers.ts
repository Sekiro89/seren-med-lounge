import { ApiError } from '@serenemed/api-client';

export interface PatientName {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ReviewRow {
  id: string;
  stage: string;
  rating: number;
  comment: string | null;
  format: string;
  publishConsent: boolean;
  moderationStatus: string;
  createdAt: string;
  patient: PatientName;
}

export interface PublishedRow {
  id: string;
  stage: string;
  rating: number;
  comment: string | null;
  format: string;
  createdAt: string;
  moderatedAt: string | null;
  patient: { firstName: string };
}

export interface RequestRow {
  id: string;
  stage: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  patient: PatientName;
}

export const STAGES = [
  {
    value: 'AFTER_SECOND_CONSULTATION',
    label: 'After second consultation',
    hint: 'For a patient who has had two closed consultations.',
  },
  {
    value: 'AFTER_FIRST_FOLLOW_UP',
    label: 'After first follow-up',
    hint: 'For a patient whose first follow-up is done.',
  },
  {
    value: 'AFTER_PROCEDURE',
    label: 'After a procedure',
    hint: 'For a patient with a completed procedure. Needs the procedure id.',
  },
] as const;

export function stageLabel(stage: string): string {
  return STAGES.find((s) => s.value === stage)?.label ?? stage;
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
