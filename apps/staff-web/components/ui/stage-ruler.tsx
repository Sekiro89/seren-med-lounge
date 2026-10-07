import type { ReactNode } from 'react';

export type StageState = 'done' | 'current' | 'todo' | 'stopped';

export interface Stage {
  label: string;
  state: StageState;
  /** A small mono line under the label: a date, an amount, "now". */
  note?: ReactNode;
}

const SR_WORD: Record<StageState, string> = {
  done: 'done',
  current: 'current stage',
  todo: 'still to come',
  stopped: 'stopped here',
};

/**
 * The Ruler for a record's stages (design system 4), like the patient
 * app's visit progress: squares on a hairline axis, finished stages in ink,
 * the current one in cobalt, the rest outlined. A stage the record stopped
 * at (denied, rejected, closed) is a red square, always with its word.
 */
export function StageRuler({
  stages,
  label,
  className = '',
}: {
  stages: Stage[];
  label: string;
  className?: string;
}) {
  const n = stages.length;
  const at = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  let reached = -1;
  stages.forEach((s, i) => {
    if (s.state !== 'todo') reached = i;
  });
  const inkTo = reached < 0 ? 0 : at(reached);

  return (
    <div className={`relative h-[4.25rem] ${className}`}>
      <div aria-hidden="true" className="absolute inset-x-[5px] top-[5px] h-px bg-control" />
      {reached > 0 && (
        <div
          aria-hidden="true"
          className="absolute left-[5px] top-1 h-[3px] bg-fg"
          style={{ width: `calc(${inkTo}% - ${reached === n - 1 ? 10 : 5}px)` }}
        />
      )}
      <ol aria-label={label} className="text-[13px]">
        {stages.map((s, i) => {
          const align =
            i === 0
              ? 'items-start text-left'
              : i === n - 1
                ? 'items-end text-right -translate-x-full'
                : 'items-center text-center -translate-x-1/2';
          return (
            <li
              key={s.label}
              aria-current={s.state === 'current' ? 'step' : undefined}
              className={`absolute top-0 flex flex-col ${align}`}
              style={{ left: `${at(i)}%` }}
            >
              <span
                aria-hidden="true"
                className={`block size-[11px] ${
                  s.state === 'current'
                    ? 'bg-primary outline outline-[3px] outline-primary-subtle'
                    : s.state === 'done'
                      ? 'bg-fg'
                      : s.state === 'stopped'
                        ? 'bg-danger outline outline-[3px] outline-danger-bg'
                        : 'border border-fg-subtle bg-surface'
                }`}
              />
              <span
                className={`mt-2 whitespace-nowrap ${
                  s.state === 'current' || s.state === 'stopped'
                    ? 'font-semibold text-fg'
                    : s.state === 'done'
                      ? 'text-fg'
                      : 'text-fg-muted'
                }`}
              >
                {s.label}
                <span className="sr-only">, {SR_WORD[s.state]}</span>
              </span>
              {s.note && (
                <span
                  className={`tabular whitespace-nowrap font-mono text-[12px] ${
                    s.state === 'current'
                      ? 'text-primary'
                      : s.state === 'stopped'
                        ? 'text-danger-fg'
                        : 'text-fg-muted'
                  }`}
                >
                  {s.note}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
