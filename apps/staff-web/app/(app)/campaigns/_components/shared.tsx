import { Badge } from '../../../../components/ui/badge';
import { STATUS_LABELS, type LeadStatus } from '../../leads/_components/shared';
import { formatDate } from '../../../../lib/format';
import type { Tone } from '../../../../lib/status';

export type CampaignStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export const CAMPAIGN_TYPES = [
  'DIGITAL',
  'HEALTH_CAMP',
  'EVENT',
  'REFERRAL_PROGRAM',
  'OTHER',
] as const;

export const TYPE_LABELS: Record<string, string> = {
  DIGITAL: 'Digital',
  HEALTH_CAMP: 'Health camp',
  EVENT: 'Event',
  REFERRAL_PROGRAM: 'Referral program',
  OTHER: 'Other',
};

const STATUS_TONES: Record<CampaignStatus, Tone> = {
  PLANNED: 'neutral',
  ACTIVE: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const key = status as CampaignStatus;
  return (
    <Badge tone={STATUS_TONES[key] ?? 'neutral'}>{CAMPAIGN_STATUS_LABELS[key] ?? status}</Badge>
  );
}

export interface CampaignRow {
  id: string;
  name: string;
  type: string;
  status: CampaignStatus;
  channel: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  budgetMinor: number | null;
  notes: string | null;
  _count?: { leads: number };
}

export type Funnel = Record<LeadStatus, number>;

export interface CampaignDetail extends CampaignRow {
  createdBy: { id: string; fullName: string } | null;
  funnel: Funnel;
  totalLeads: number;
}

export const FUNNEL_ORDER: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'NURTURING',
  'APPOINTMENT_BOOKED',
  'CONVERTED',
  'LOST',
];

/** Fill token per stage; every stage is also named and counted, never colour alone. */
export const FUNNEL_FILL: Record<LeadStatus, string> = {
  NEW: 'bg-fg-subtle',
  CONTACTED: 'bg-info-fg',
  NURTURING: 'bg-primary',
  APPOINTMENT_BOOKED: 'bg-warning-fg',
  CONVERTED: 'bg-success-fg',
  LOST: 'bg-danger',
};

export const FUNNEL_LABELS = STATUS_LABELS;

/** Status moves the API allows, with the verb for each. */
export const NEXT_MOVES: Record<
  CampaignStatus,
  { to: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'; label: string }[]
> = {
  PLANNED: [
    { to: 'ACTIVE', label: 'Start campaign' },
    { to: 'CANCELLED', label: 'Cancel campaign' },
  ],
  ACTIVE: [
    { to: 'COMPLETED', label: 'Mark completed' },
    { to: 'CANCELLED', label: 'Cancel campaign' },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

/** A datetime-local or date value at the start of the clinic day, as ISO. */
export function dateToIso(value: string, endOfDay = false): string {
  return new Date(`${value}T${endOfDay ? '23:59:00' : '00:00:00'}+05:30`).toISOString();
}

export function dateRange(c: Pick<CampaignRow, 'startsAt' | 'endsAt'>): string {
  if (c.startsAt && c.endsAt) return `${formatDate(c.startsAt)} to ${formatDate(c.endsAt)}`;
  if (c.startsAt) return `Starts ${formatDate(c.startsAt)}`;
  if (c.endsAt) return `Ends ${formatDate(c.endsAt)}`;
  return 'No dates set';
}
