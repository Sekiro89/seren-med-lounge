import { formatDate, formatMoney, formatTime } from '../../../../lib/format';
import { Badge } from '../../../../components/ui/badge';
import { StageRuler, type Stage as RulerStage } from '../../../../components/ui/stage-ruler';
import {
  stageOf,
  STATUS_LABEL,
  STATUS_TONE,
  type CaseDetail,
  type CaseEvent,
  type CaseStatus,
  type Stage,
} from './insurance-types';

const STEPS: { key: Stage; label: string }[] = [
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'preauth', label: 'Pre-authorisation' },
  { key: 'claims', label: 'Claim' },
  { key: 'settled', label: 'Settled' },
];
const ORDER = STEPS.map((s) => s.key);

const STOPPED: CaseStatus[] = ['PRE_AUTH_DENIED', 'CLAIM_REJECTED'];

/** How far a case got: the furthest stage reached, even for a closed case. */
function reachedIndex(status: CaseStatus, events: { toStatus: CaseStatus }[] = []): number {
  if (status !== 'CLOSED') return ORDER.indexOf(stageOf(status));
  return Math.max(
    ...events.filter((e) => e.toStatus !== 'CLOSED').map((e) => ORDER.indexOf(stageOf(e.toStatus))),
    0,
  );
}

/**
 * The case on the Ruler (design system 4): Eligibility, Pre-authorisation,
 * Claim, Settled as squares on a hairline, done stages in ink with the date
 * they were reached, the current one in cobalt with its status, a denial or
 * rejection in red. A closed case gets a final "Closed" mark.
 */
export function StageTracker({ detail }: { detail: CaseDetail }) {
  const closed = detail.status === 'CLOSED';
  const reached = reachedIndex(detail.status, detail.events);
  const firstAt = (stage: Stage) =>
    detail.events.find((e) => e.fromStatus !== e.toStatus && stageOf(e.toStatus) === stage)
      ?.createdAt ?? (stage === 'eligibility' ? detail.createdAt : undefined);

  const stages: RulerStage[] = STEPS.map((step, index) => {
    const at = firstAt(step.key);
    if (index < reached || (closed && index === reached)) {
      return { label: step.label, state: 'done', note: at ? formatDate(at).slice(0, 6) : 'done' };
    }
    if (index === reached) {
      return {
        label: step.label,
        state: STOPPED.includes(detail.status) ? 'stopped' : 'current',
        note: STATUS_LABEL[detail.status].toLowerCase(),
      };
    }
    return { label: step.label, state: 'todo' };
  });
  if (closed) {
    const closedAt = [...detail.events].reverse().find((e) => e.toStatus === 'CLOSED')?.createdAt;
    stages.push({
      label: 'Closed',
      state: 'done',
      note: closedAt ? formatDate(closedAt).slice(0, 6) : undefined,
    });
  }
  return <StageRuler label="Case stages" stages={stages} />;
}

/**
 * The same stages as four small squares for a list row: ink for done,
 * cobalt for the current stage, red where the case stopped. Decorative;
 * the status word sits beside it.
 */
export function StageTicks({ status }: { status: CaseStatus }) {
  const reached = reachedIndex(status);
  const closed = status === 'CLOSED';
  return (
    <span aria-hidden="true" className="inline-flex items-center">
      {STEPS.map((step, i) => {
        const cls =
          closed && i <= reached
            ? 'bg-fg-subtle'
            : i < reached || (status === 'SETTLED' && i === reached)
              ? 'bg-fg'
              : i === reached
                ? STOPPED.includes(status)
                  ? 'bg-danger'
                  : 'bg-primary'
                : 'border border-fg-subtle bg-surface';
        return (
          <span key={step.key} className="inline-flex items-center">
            {i > 0 && <span className={`h-px w-2.5 ${i <= reached ? 'bg-fg' : 'bg-control'}`} />}
            <span className={`block size-[7px] ${cls}`} />
          </span>
        );
      })}
    </span>
  );
}

function describe(e: CaseEvent): string {
  if (e.fromStatus === null) return 'Case opened';
  if (e.fromStatus === e.toStatus) return 'Note added';
  return `${STATUS_LABEL[e.fromStatus]} to ${STATUS_LABEL[e.toStatus]}`;
}

/** The case history as a ruled log: time in mono at the left, newest first. */
export function CaseTimeline({ events }: { events: CaseEvent[] }) {
  const newestFirst = [...events].reverse();
  return (
    <ol className="divide-y divide-line">
      {newestFirst.map((e) => (
        <li key={e.id} className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 py-3">
          <time
            dateTime={e.createdAt}
            className="tabular pt-px font-mono text-[12px] text-fg-muted"
          >
            {formatDate(e.createdAt).slice(0, 6)}
            <span className="block">{formatTime(e.createdAt)}</span>
          </time>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-medium text-fg">{describe(e)}</span>
              {e.fromStatus !== e.toStatus && (
                <Badge tone={STATUS_TONE[e.toStatus]}>{STATUS_LABEL[e.toStatus]}</Badge>
              )}
              {e.amountMinor !== null && (
                <span className="tabular ml-auto font-mono text-[13px] text-fg">
                  {formatMoney(e.amountMinor)}
                </span>
              )}
            </div>
            {e.note && (
              <p className="mt-1 max-w-[72ch] whitespace-pre-wrap text-[13px] text-fg-muted">
                {e.note}
              </p>
            )}
            <p className="mt-0.5 text-[12px] text-fg-subtle">By {e.actor.fullName}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
