import type { Tone } from '../../../../lib/status';

export type ReferralStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
export type Urgency = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

export interface ReferralRow {
  id: string;
  type: 'INTERNAL' | 'EXTERNAL';
  status: ReferralStatus;
  urgency: Urgency;
  reason: string;
  outcomeNote: string | null;
  toName: string | null;
  toFacility: string | null;
  toSpecialty: string | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  patient: { id: string; firstName: string; lastName: string };
  referredBy: { id: string; fullName: string };
  toUser: { id: string; fullName: string } | null;
}

export const URGENCY_TONE: Record<Urgency, Tone> = {
  ROUTINE: 'neutral',
  URGENT: 'warning',
  EMERGENCY: 'danger',
};

export const STATUS_TONE: Record<ReferralStatus, Tone> = {
  OPEN: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

/** Where the patient is being sent: a colleague, or a facility and specialty. */
export function destination(row: ReferralRow): { main: string; sub?: string } {
  if (row.toUser) return { main: row.toUser.fullName, sub: row.toSpecialty ?? undefined };
  const main = row.toName ?? row.toFacility ?? 'External';
  const sub = [row.toName ? row.toFacility : null, row.toSpecialty].filter(Boolean).join(', ');
  return { main, sub: sub || undefined };
}
