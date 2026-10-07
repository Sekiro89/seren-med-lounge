import { humanize } from './format';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

/**
 * One status-to-colour mapping for the whole app, from the table in
 * docs/design/DESIGN_SYSTEM.md section 2.4. A status is always shown with
 * its text label; colour is never the only signal.
 */
const TONES: Record<string, Record<string, Tone>> = {
  appointment: {
    REQUESTED: 'neutral',
    CONFIRMED: 'info',
    CHECKED_IN: 'info',
    IN_PROGRESS: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    NO_SHOW: 'danger',
  },
  queue: {
    WAITING: 'neutral',
    CALLED: 'info',
    IN_SERVICE: 'warning',
    COMPLETED: 'success',
    SKIPPED: 'danger',
  },
  invoice: {
    ISSUED: 'neutral',
    PARTIALLY_PAID: 'info',
    PAID: 'success',
    VOID: 'danger',
  },
  note: {
    DRAFT: 'warning',
    AI_DRAFT: 'warning',
    REVIEWED: 'info',
    FINALIZED: 'success',
    AMENDED: 'info',
  },
  followUp: {
    PENDING: 'neutral',
    ESCALATED: 'warning',
    DONE: 'success',
    MISSED: 'danger',
    CANCELLED: 'neutral',
  },
};

export type StatusDomain = keyof typeof TONES;

export function statusTone(domain: StatusDomain, status: string): Tone {
  return TONES[domain]?.[status] ?? 'neutral';
}

export function statusLabel(status: string): string {
  return humanize(status);
}
