'use client';

import { formatTime } from '../../../lib/format';
import type { QueueStation, QueueToken } from '../../../lib/types';

/** The five stages of a clinic visit as the patient sees them (design system 4, the Ruler). */
const STAGES = ['Check-in', 'Nurse', 'Doctor', 'Lab', 'Pay'] as const;

const STAGE_OF: Record<QueueStation, number> = {
  VITALS: 1,
  JUNIOR_DOCTOR: 2,
  SENIOR_DOCTOR: 2,
  LAB: 3,
  BILLING: 4,
  PHARMACY: 4,
};

/** Where each marker sits along the axis, in percent. */
const AT = [0, 28, 52, 76, 100];

/**
 * The time to print under a finished stage: check-in is the token's first
 * event; any other stage is when the patient was seen there (or, failing
 * that, when they arrived). No history, no times: nothing is invented.
 */
function stageTimes(token: QueueToken): Array<string | undefined> {
  const history = token.history ?? [];
  const times: Array<string | undefined> = STAGES.map(() => undefined);
  if (history.length === 0) return times;
  times[0] = history[0]!.at;
  for (let stage = 1; stage < STAGES.length; stage++) {
    const here = history.filter((e) => STAGE_OF[e.station] === stage);
    times[stage] = (here.find((e) => e.status === 'IN_SERVICE') ?? here[0])?.at;
  }
  return times;
}

const NOW_WORD: Record<QueueToken['status'], string> = {
  WAITING: 'waiting',
  CALLED: 'your turn',
  IN_SERVICE: 'now',
  COMPLETED: 'done',
  SKIPPED: 'missed',
};

/**
 * Check-in → Nurse → Doctor → Lab → Pay on a hairline axis: finished
 * stages in ink with their time (when the API sends the history), the
 * current stage in cobalt, the rest outlined.
 */
export function VisitProgress({ token }: { token: QueueToken }) {
  const current = STAGE_OF[token.station];
  const times = stageTimes(token);
  const inkTo = AT[current]!;

  return (
    <div className="relative mt-6 h-[4.6rem]">
      {/* The axis, and the ink covering the stages already passed. */}
      <div aria-hidden="true" className="absolute inset-x-[5px] top-[5px] h-px bg-control" />
      <div
        aria-hidden="true"
        className="absolute left-[5px] top-1 h-[3px] bg-fg"
        style={{ width: `calc(${inkTo}% - ${current === 4 ? 10 : 5}px)` }}
      />
      <ol aria-label="Your visit today" className="text-sm">
        {STAGES.map((label, i) => {
          const done = i < current;
          const now = i === current;
          const align =
            i === 0
              ? 'items-start text-left'
              : i === STAGES.length - 1
                ? 'items-end text-right -translate-x-full'
                : 'items-center text-center -translate-x-1/2';
          const time = done ? times[i] : undefined;
          return (
            <li
              key={label}
              aria-current={now ? 'step' : undefined}
              className={`absolute top-0 flex flex-col ${align}`}
              style={{ left: `${AT[i]}%` }}
            >
              <span
                aria-hidden="true"
                className={`block size-[11px] ${
                  now
                    ? 'bg-primary outline outline-[3px] outline-primary-subtle'
                    : done
                      ? 'bg-fg'
                      : 'border border-fg-subtle bg-surface'
                }`}
              />
              <span
                className={`mt-2 whitespace-nowrap ${now ? 'font-semibold text-fg' : 'text-fg-muted'}`}
              >
                {label}
                <span className="sr-only">
                  {done ? ', done' : now ? ', where you are now' : ', still to come'}
                </span>
              </span>
              {now ? (
                <span className="font-mono text-primary">{NOW_WORD[token.status]}</span>
              ) : (
                time && (
                  <time dateTime={time} className="tabular font-mono text-fg-muted">
                    {formatTime(time)}
                  </time>
                )
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
