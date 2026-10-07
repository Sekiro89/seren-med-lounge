import type { ReactNode } from 'react';
import { statusLabel, statusTone, type StatusDomain, type Tone } from '../../lib/status';

const TONES: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-neutral-fg',
  info: 'bg-info-bg text-info-fg',
  warning: 'bg-warning-bg text-warning-fg',
  success: 'bg-success-bg text-success-fg',
  danger: 'bg-danger-bg text-danger-fg',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** A domain status with its fixed colour and a text label (never colour alone). */
export function StatusBadge({ domain, status }: { domain: StatusDomain; status: string }) {
  return <Badge tone={statusTone(domain, status)}>{statusLabel(status)}</Badge>;
}
