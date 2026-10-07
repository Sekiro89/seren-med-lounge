import { formatDate, formatMoney, formatTime } from '../../../../lib/format';
import { Badge } from '../../../../components/ui/badge';
import {
  stageOf,
  STATUS_LABEL,
  STATUS_TONE,
  type CaseDetail,
  type CaseEvent,
  type Stage,
} from './insurance-types';

const STEPS: { key: Stage; label: string }[] = [
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'preauth', label: 'Pre-authorisation' },
  { key: 'claims', label: 'Claim' },
  { key: 'settled', label: 'Settled' },
];

/** Horizontal stage tracker: reached steps, the current one, and what is ahead. */
export function StageTracker({ detail }: { detail: CaseDetail }) {
  const order = STEPS.map((s) => s.key);
  const closed = detail.status === 'CLOSED';
  // For a closed case, the furthest stage it reached before closing.
  const reached = closed
    ? Math.max(
        ...detail.events
          .filter((e) => e.toStatus !== 'CLOSED')
          .map((e) => order.indexOf(stageOf(e.toStatus))),
        0,
      )
    : order.indexOf(stageOf(detail.status));

  return (
    <ol className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Case stages">
      {STEPS.map((step, index) => {
        const current = !closed && index === reached;
        const done = index < reached || (closed && index === reached);
        return (
          <li
            key={step.key}
            aria-current={current ? 'step' : undefined}
            className={`border-t-2 pt-3 ${
              current ? 'border-primary' : done ? 'border-primary/40' : 'border-line'
            }`}
          >
            <p
              className={`text-sm font-medium ${
                current ? 'text-primary-subtle-fg' : done ? 'text-fg' : 'text-fg-subtle'
              }`}
            >
              {step.label}
            </p>
            <p className="mt-1 text-[13px] text-fg-muted">
              {current ? STATUS_LABEL[detail.status] : done ? 'Done' : 'Not started'}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function describe(e: CaseEvent): string {
  if (e.fromStatus === null) return 'Case opened';
  if (e.fromStatus === e.toStatus) return 'Note added';
  return `${STATUS_LABEL[e.fromStatus]} to ${STATUS_LABEL[e.toStatus]}`;
}

export function CaseTimeline({ events }: { events: CaseEvent[] }) {
  const newestFirst = [...events].reverse();
  return (
    <ol className="flex flex-col divide-y divide-line">
      {newestFirst.map((e) => (
        <li key={e.id} className="flex flex-col gap-2 py-5 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{describe(e)}</span>
              {e.fromStatus !== e.toStatus && (
                <Badge tone={STATUS_TONE[e.toStatus]}>{STATUS_LABEL[e.toStatus]}</Badge>
              )}
              {e.amountMinor !== null && (
                <span className="tabular text-sm text-fg-muted">{formatMoney(e.amountMinor)}</span>
              )}
            </div>
            <time dateTime={e.createdAt} className="text-[13px] text-fg-subtle">
              {formatDate(e.createdAt)}, {formatTime(e.createdAt)}
            </time>
          </div>
          {e.note && <p className="whitespace-pre-wrap text-sm text-fg-muted">{e.note}</p>}
          <p className="text-[13px] text-fg-subtle">By {e.actor.fullName}</p>
        </li>
      ))}
    </ol>
  );
}
