import { ApiError } from '@serenemed/api-client';

export interface ThreadRow {
  id: string;
  subject: string;
  status: 'OPEN' | 'CLOSED';
  lastMessageAt: string;
  patient: { id: string; firstName: string; lastName: string };
  assignedTo: { id: string; fullName: string } | null;
  unreadCount: number;
}

export interface MessageRow {
  id: string;
  senderType: 'PATIENT' | 'USER';
  senderUser: { id: string; fullName: string } | null;
  body: string;
  createdAt: string;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  status: 'OPEN' | 'CLOSED';
  patient: { id: string; firstName: string; lastName: string };
  assignedTo: { id: string; fullName: string } | null;
  messages: MessageRow[];
}

export type FilterKey = 'open' | 'mine' | 'closed';

export const FILTER_QUERY: Record<FilterKey, string> = {
  open: 'status=OPEN',
  mine: 'status=OPEN&assignedToMe=true',
  closed: 'status=CLOSED',
};

export function parseFilter(value: string | null): FilterKey {
  return value === 'mine' || value === 'closed' ? value : 'open';
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
