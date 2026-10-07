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
 * Check-in → Nurse → Doctor → Lab → Pay as five equal columns hanging
 * from one hairline axis (the prototype's ruler): finished stages as ink
 * squares with their time (when the API sends the history), the current
 * stage in cobalt with a word, the rest outlined.
 */
export function VisitProgress({ token }: { token: QueueToken }) {
  const current = STAGE_OF[token.station];
  const times = stageTimes(token);

  return (
    <ol
      aria-label="Your visit today"
      className="mt-3 grid grid-cols-5 border-t border-control text-[0.8rem] leading-snug"
    >
      {STAGES.map((label, i) => {
        const done = i < current;
        const now = i === current;
        const time = done ? times[i] : undefined;
        return (
          <li
            key={label}
            aria-current={now ? 'step' : undefined}
            className={`relative flex min-w-0 flex-col pt-3 ${
              now ? 'font-semibold text-primary' : done ? 'text-fg' : 'text-fg-muted'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute -top-[6px] left-0 size-[11px] border ${
                now
                  ? 'border-primary bg-primary'
                  : done
                    ? 'border-fg bg-fg'
                    : 'border-control bg-surface'
              }`}
            />
            <span className="truncate">
              {label}
              <span className="sr-only">
                {done ? ', done' : now ? ', where you are now' : ', still to come'}
              </span>
            </span>
            {now ? (
              <span className="font-mono text-[0.75rem]">{NOW_WORD[token.status]}</span>
            ) : (
              time && (
                <time
                  dateTime={time}
                  className="tabular font-mono text-[0.75rem] font-normal text-fg-muted"
                >
                  {formatTime(time)}
                </time>
              )
            )}
          </li>
        );
      })}
    </ol>
  );
}
