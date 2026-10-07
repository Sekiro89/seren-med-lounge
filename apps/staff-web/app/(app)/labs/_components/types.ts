import { ApiError } from '@serenemed/api-client';

export interface LabResultRow {
  id: string;
  resultValue: string;
  unit: string | null;
  referenceRange: string | null;
  createdAt: string;
}

export interface LabItemRow {
  id: string;
  testName: string;
  instructions: string | null;
  /** Newest first: results[0] is the current result. */
  results: LabResultRow[];
}

export interface LabOrderRow {
  id: string;
  status: 'ORDERED' | 'CANCELLED';
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string };
  author: { id: string; fullName: string };
  items: LabItemRow[];
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
