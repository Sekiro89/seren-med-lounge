import { ApiError } from '@serenemed/api-client';
import { Badge } from '../../../../components/ui/badge';
import type { Tone } from '../../../../lib/status';

export type LeadStatus =
  'NEW' | 'CONTACTED' | 'NURTURING' | 'APPOINTMENT_BOOKED' | 'CONVERTED' | 'LOST';

export const LEAD_SOURCES = [
  'WEBSITE',
  'SOCIAL_MEDIA',
  'CAMPAIGN',
  'REFERRAL',
  'CAMP',
  'WALK_IN',
] as const;

export const SOURCE_LABELS: Record<string, string> = {
  WEBSITE: 'Website',
  SOCIAL_MEDIA: 'Social media',
  CAMPAIGN: 'Campaign',
  REFERRAL: 'Referral',
  CAMP: 'Health camp',
  WALK_IN: 'Walk-in',
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  NURTURING: 'Nurturing',
  APPOINTMENT_BOOKED: 'Appointment booked',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

/** One mapping for lead statuses everywhere in the marketing desks. */
const STATUS_TONES: Record<LeadStatus, Tone> = {
  NEW: 'neutral',
  CONTACTED: 'info',
  NURTURING: 'info',
  APPOINTMENT_BOOKED: 'warning',
  CONVERTED: 'success',
  LOST: 'danger',
};

export function LeadStatusBadge({ status }: { status: string }) {
  const key = status as LeadStatus;
  return <Badge tone={STATUS_TONES[key] ?? 'neutral'}>{STATUS_LABELS[key] ?? status}</Badge>;
}

export interface LeadRow {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  source: string;
  status: LeadStatus;
  enquiry: string | null;
  consentToContact: boolean;
  consentRecordedAt: string | null;
  nextFollowUpAt: string | null;
  lostReason: string | null;
  convertedAt: string | null;
  convertedPatientId: string | null;
  createdAt: string;
  owner: { id: string; fullName: string } | null;
  campaign: { id: string; name: string; type: string } | null;
}

export interface LeadActivity {
  id: string;
  type: string;
  notes: string | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
}

export interface LeadDetail extends LeadRow {
  referredByPatient: { id: string; firstName: string; lastName: string } | null;
  convertedPatient: { id: string; firstName: string; lastName: string } | null;
  activities: LeadActivity[];
}

export interface StaffOption {
  id: string;
  fullName: string;
  role: string;
}

export const leadName = (lead: { firstName: string; lastName: string | null }) =>
  `${lead.firstName} ${lead.lastName ?? ''}`.trim();

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

export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string | undefined;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-sm text-fg-muted">{message ?? 'This could not be loaded.'}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-10 cursor-pointer items-center rounded-control border border-control px-5 text-sm font-medium text-fg hover:bg-surface-muted"
      >
        Try again
      </button>
    </div>
  );
}
