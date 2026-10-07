'use client';

import { HATCH_STYLE } from '../../../../components/ui/ink';

export interface RulerVisit {
  id: string;
  scheduledAt: string;
  status: string;
}

type Kind = 'seen' | 'in' | 'booked' | 'off';

const KIND: Record<Kind, { fill: string; label: string }> = {
  seen: { fill: 'bg-fg', label: 'Completed' },
  in: { fill: 'bg-warning-fg', label: 'In the clinic' },
  booked: { fill: 'bg-primary', label: 'Booked' },
  off: { fill: 'border border-control bg-surface', label: 'Cancelled or no-show' },
};

function kindOf(status: string): Kind {
  if (status === 'COMPLETED') return 'seen';
  if (status === 'CHECKED_IN' || status === 'IN_PROGRESS') return 'in';
  if (status === 'CANCELLED' || status === 'NO_SHOW') return 'off';
  return 'booked';
}

/** Minutes since clinic midnight (IST) for an ISO timestamp or epoch. */
function clinicMinutes(at: string | number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

const toMinutes = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const SLOT = 15;
const LANE = 7;

/**
 * The clinic's day as a ruler (design system 4, the signature), sibling of
 * the doctor's schedule ruler on Today: an hour axis, every appointment as
 * a quarter-hour mark coloured by where it is (completed ink, in the
 * clinic amber, booked cobalt, cancelled outlined), stacked when several
 * share a slot, and the red "now" tick on today.
 */
export function DayRuler({
  visits,
  isToday,
  now,
  hours,
}: {
  visits: RulerVisit[];
  isToday: boolean;
  now: number;
  /** Clinic opening hours for this weekday (HH:MM); null when closed, undefined when unknown. */
  hours?: { opensAt: string | null; closesAt: string | null } | null;
}) {
  const marks = visits.map((v) => ({
    id: v.id,
    at: clinicMinutes(v.scheduledAt),
    kind: kindOf(v.status),
  }));
  const nowMin = clinicMinutes(now);
  const times = marks.map((m) => m.at);
  const opens = hours?.opensAt ? toMinutes(hours.opensAt) : undefined;
  const closes = hours?.closesAt ? toMinutes(hours.closesAt) : undefined;
  const from = Math.min(
    Math.floor((opens ?? 9 * 60) / 60) * 60,
    ...times.map((t) => Math.floor(t / 60) * 60),
  );
  const to = Math.max(
    Math.ceil((closes ?? 18 * 60) / 60) * 60,
    ...times.map((t) => Math.ceil((t + SLOT) / 60) * 60),
  );
  const span = to - from;
  const pct = (m: number) => ((m - from) / span) * 100;
  // Hatched where the clinic is closed (design system 4: closed = hatched).
  const closed: Array<{ start: number; end: number }> =
    hours === null
      ? [{ start: from, end: to }]
      : opens !== undefined && closes !== undefined
        ? [
            ...(opens > from ? [{ start: from, end: opens }] : []),
            ...(closes < to ? [{ start: closes, end: to }] : []),
          ]
        : [];

  // Stack marks that share a quarter hour, one lane each.
  const lanes = new Map<number, number>();
  const placed = [...marks]
    .sort((a, b) => a.at - b.at)
    .map((m) => {
      const slot = Math.floor(m.at / SLOT) * SLOT;
      const lane = lanes.get(slot) ?? 0;
      lanes.set(slot, lane + 1);
      return { ...m, slot, lane };
    });
  const depth = Math.max(1, ...lanes.values());
  const shownDepth = Math.min(depth, 5);
  const blockTop = 18;
  const axisTop = blockTop + shownDepth * LANE + 2;

  const perHour = new Map<number, number>();
  for (const m of marks) {
    if (m.kind === 'off') continue;
    const h = Math.floor(m.at / 60);
    perHour.set(h, (perHour.get(h) ?? 0) + 1);
  }
  const busiest = [...perHour.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const counts = (Object.keys(KIND) as Kind[]).map((k) => ({
    kind: k,
    n: marks.filter((m) => m.kind === k).length,
  }));
  const ticks: number[] = [];
  for (let m = from; m <= to; m += 30) ticks.push(m);
  const showNow = isToday && nowMin >= from && nowMin <= to;

  return (
    <div className="border-b border-line px-5 pb-3 pt-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12px]">
        <p className="font-medium text-fg">
          The day
          <span className="ml-2 font-normal text-fg-muted">
            {hours === null
              ? 'Clinic closed this day. '
              : hours?.opensAt && hours.closesAt
                ? `Open ${hours.opensAt} to ${hours.closesAt}. `
                : ''}
            {marks.length === 0
              ? 'Nothing booked'
              : busiest
                ? `Busiest ${hhmm(busiest[0] * 60)} with ${busiest[1]} visit${busiest[1] === 1 ? '' : 's'}`
                : 'Every visit cancelled'}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-5 text-fg-muted">
          {counts.map((c) => (
            <span key={c.kind} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-1.5 w-4 ${KIND[c.kind].fill}`} />
              {KIND[c.kind].label}
              <b className="tabular font-mono font-medium text-fg">{c.n}</b>
            </span>
          ))}
        </div>
      </div>

      <div
        className="relative mt-3"
        style={{ height: axisTop + 20 }}
        role="img"
        aria-label={`Appointments across the day. ${counts
          .map((c) => `${c.n} ${KIND[c.kind].label.toLowerCase()}`)
          .join(', ')}.`}
      >
        {closed.map((c) => (
          <div
            key={c.start}
            className="absolute"
            style={{
              ...HATCH_STYLE,
              left: `${pct(c.start)}%`,
              width: `${pct(c.end) - pct(c.start)}%`,
              top: blockTop,
              height: shownDepth * LANE - 2,
            }}
          />
        ))}
        <div className="absolute inset-x-0 h-px bg-control" style={{ top: axisTop }} />
        {ticks.map((m) => {
          const hour = m % 60 === 0;
          return (
            <div key={m}>
              <div
                className={`absolute w-px ${hour ? 'bg-fg-muted' : 'bg-control'}`}
                style={{
                  left: `${pct(m)}%`,
                  top: hour ? axisTop - 8 : axisTop - 4,
                  height: hour ? 9 : 5,
                }}
              />
              {hour && (
                <div
                  className={`tabular absolute top-[-4px] font-mono text-[11px] text-fg-muted ${
                    m === to ? '-translate-x-full' : m === from ? '' : '-translate-x-1/2'
                  }`}
                  style={{ left: `${pct(m)}%` }}
                >
                  {m / 60}
                </div>
              )}
            </div>
          );
        })}
        {placed
          .filter((m) => m.lane < shownDepth)
          .map((m) => (
            <div
              key={m.id}
              className={`absolute ${KIND[m.kind].fill}`}
              style={{
                left: `calc(${pct(m.slot)}% + 1px)`,
                width: `calc(${(SLOT / span) * 100}% - 2px)`,
                top: blockTop + (shownDepth - 1 - m.lane) * LANE,
                height: LANE - 2,
              }}
            />
          ))}
        {showNow && (
          <>
            <div
              className="absolute w-[2px] bg-danger"
              style={{
                left: `${pct(nowMin)}%`,
                top: blockTop - 6,
                height: axisTop - blockTop + 12,
              }}
            />
            <div
              className="tabular absolute -translate-x-1/2 whitespace-nowrap bg-surface px-1 font-mono text-[11px] font-semibold text-danger-fg"
              style={{ left: `${pct(nowMin)}%`, top: axisTop + 4 }}
            >
              now {hhmm(nowMin)}
            </div>
          </>
        )}
      </div>
      {depth > shownDepth && (
        <p className="text-[11px] text-fg-subtle">
          Up to {depth} visits share one quarter hour; the ruler shows the first {shownDepth}.
        </p>
      )}
    </div>
  );
}
