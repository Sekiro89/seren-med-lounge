'use client';

import { clinicMinutes, hhmm, toMinutes, type Availability, type AgendaRow } from './model';

const HATCH = {
  backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 5px, var(--line) 5px 6px)',
} as const;

interface Slot {
  start: number;
  length: number;
  kind: 'seen' | 'booked' | 'free';
}

/**
 * The day as a ruler (design system 4, the signature): the doctor's hours
 * for today, each visit-length slot seen (ink), booked (cobalt) or free
 * (outlined), closed gaps hatched, and a red tick at the current time.
 */
export function ScheduleRuler({
  windows,
  rows,
  now,
  loading,
}: {
  windows: Availability[];
  rows: AgendaRow[];
  now: number;
  loading: boolean;
}) {
  const sorted = [...windows].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const visits = rows
    .filter((r) => r.phase !== 'cancelled' && r.phase !== 'no-show')
    .map((r) => ({ at: clinicMinutes(r.appointment.scheduledAt), seen: r.phase === 'seen' }));
  const nowMin = clinicMinutes(now);
  const slotLength = sorted[0]?.slotMinutes ?? 15;

  const opens = [...sorted.map((w) => toMinutes(w.startTime)), ...visits.map((v) => v.at)];
  const ends = [
    ...sorted.map((w) => toMinutes(w.endTime)),
    ...visits.map((v) => v.at + slotLength),
  ];
  const from = opens.length ? Math.floor(Math.min(...opens) / 60) * 60 : 9 * 60;
  const to = ends.length ? Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60) : 18 * 60;
  const span = Math.max(60, to - from);
  const pct = (m: number) => ((m - from) / span) * 100;

  const slots: Slot[] = [];
  const placed = new Set<number>();
  for (const w of sorted) {
    const start = toMinutes(w.startTime);
    const end = toMinutes(w.endTime);
    for (let t = start; t + w.slotMinutes <= end; t += w.slotMinutes) {
      const inSlot = visits.filter((v, i) => {
        const hit = v.at >= t && v.at < t + w.slotMinutes;
        if (hit) placed.add(i);
        return hit;
      });
      slots.push({
        start: t,
        length: w.slotMinutes,
        kind: inSlot.length === 0 ? 'free' : inSlot.every((v) => v.seen) ? 'seen' : 'booked',
      });
    }
  }
  // Visits booked outside the doctor's hours still show on the ruler, each
  // as long as a visit but never running into the next mark.
  const starts = [...slots.map((s) => s.start), ...visits.map((v) => v.at)];
  visits.forEach((v, i) => {
    if (placed.has(i)) return;
    const next = Math.min(...starts.filter((t) => t > v.at), v.at + slotLength);
    slots.push({ start: v.at, length: next - v.at, kind: v.seen ? 'seen' : 'booked' });
  });

  // Closed time: gaps between sessions (labelled) and any part of the
  // ruler before the first or after the last session.
  const closed: Array<{ start: number; end: number; label: boolean }> = [];
  const firstStart = sorted.length ? toMinutes(sorted[0]!.startTime) : to;
  const lastEnd = sorted.length ? toMinutes(sorted[sorted.length - 1]!.endTime) : to;
  if (sorted.length && firstStart > from)
    closed.push({ start: from, end: firstStart, label: false });
  for (let i = 1; i < sorted.length; i += 1) {
    const prevEnd = toMinutes(sorted[i - 1]!.endTime);
    const nextStart = toMinutes(sorted[i]!.startTime);
    if (nextStart > prevEnd) closed.push({ start: prevEnd, end: nextStart, label: true });
  }
  if (sorted.length && lastEnd < to) closed.push({ start: lastEnd, end: to, label: false });

  const nextFree = slots
    .filter((s) => s.kind === 'free' && s.start >= nowMin)
    .sort((a, b) => a.start - b.start)[0];
  const hours = sorted.map((w) => `${w.startTime}–${w.endTime}`);
  const hoursText =
    hours.length === 0
      ? 'No hours set for today'
      : hours.length === 1
        ? hours[0]
        : `${hours.slice(0, -1).join(', ')} and ${hours[hours.length - 1]}`;

  const ticks: number[] = [];
  for (let m = from; m <= to; m += slotLength >= 30 ? 30 : slotLength) ticks.push(m);
  const showNow = nowMin >= from && nowMin <= to;

  return (
    <div className="border-b border-line px-8 pb-3 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12px]">
        <p className="font-medium text-fg">
          Schedule
          <span className="ml-2 font-normal text-fg-muted">{loading ? 'Loading…' : hoursText}</span>
        </p>
        <div className="flex flex-wrap items-center gap-5 text-fg-muted">
          <Legend swatch="bg-fg" label="Seen" />
          <Legend swatch="bg-primary" label="Booked" />
          <Legend swatch="border border-control" label="Free" />
          <Legend swatch="border border-line" label="Closed" hatch />
          <span>
            Next free{' '}
            <b className="tabular font-mono font-medium text-fg">
              {nextFree ? hhmm(nextFree.start) : '—'}
            </b>
          </span>
        </div>
      </div>

      <div
        className="relative mt-3 h-[44px]"
        role="img"
        aria-label={`Schedule ${hoursText}. ${slots.filter((s) => s.kind === 'seen').length} seen, ${slots.filter((s) => s.kind === 'booked').length} booked, ${slots.filter((s) => s.kind === 'free').length} free.`}
      >
        {closed.map((c) => (
          <div key={`closed-${c.start}`}>
            <div
              className="absolute top-[16px] h-[12px]"
              style={{ ...HATCH, left: `${pct(c.start)}%`, width: `${pct(c.end) - pct(c.start)}%` }}
            />
            {c.label && (
              <div
                className="absolute top-[30px] -translate-x-1/2 whitespace-nowrap text-[11px] text-fg-muted"
                style={{ left: `${(pct(c.start) + pct(c.end)) / 2}%` }}
              >
                Closed {hhmm(c.start)}–{hhmm(c.end)}
              </div>
            )}
          </div>
        ))}
        <div className="absolute inset-x-0 top-[28px] h-px bg-control" />
        {ticks.map((m) => {
          const hour = m % 60 === 0;
          return (
            <div key={`tick-${m}`}>
              <div
                className={`absolute w-px ${hour ? 'top-[10px] h-[19px] bg-fg-muted' : 'top-[22px] h-[7px] bg-control'}`}
                style={{ left: `${pct(m)}%` }}
              />
              {hour && (
                <div
                  className={`tabular absolute top-[-6px] font-mono text-[11px] text-fg-muted ${
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
        {slots.map((s) => (
          <div
            key={`slot-${s.start}-${s.kind}`}
            className={`absolute top-[18px] h-[8px] ${
              s.kind === 'seen'
                ? 'bg-fg'
                : s.kind === 'booked'
                  ? 'bg-primary'
                  : 'border border-control bg-surface'
            }`}
            style={{
              left: `calc(${pct(s.start)}% + 2px)`,
              width: `calc(${(s.length / span) * 100}% - 4px)`,
            }}
          />
        ))}
        {showNow && (
          <>
            <div
              className="absolute top-[8px] h-[32px] w-[2px] bg-danger"
              style={{ left: `${pct(nowMin)}%` }}
            />
            <div
              className="tabular absolute top-[30px] -translate-x-1/2 whitespace-nowrap bg-surface px-1 font-mono text-[11px] font-semibold text-danger-fg"
              style={{ left: `${pct(nowMin)}%` }}
            >
              now {hhmm(nowMin)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, label, hatch }: { swatch: string; label: string; hatch?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`h-1.5 w-4 ${swatch}`}
        style={hatch ? HATCH : undefined}
      />
      {label}
    </span>
  );
}

/** "Evening session · 16:00–18:00 · 20-minute visits" for the window now running, or the next. */
export function sessionLine(windows: Availability[], now: number): string {
  const sorted = [...windows].sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (sorted.length === 0) return 'No consulting hours set for today';
  const nowMin = clinicMinutes(now);
  const current =
    sorted.find((w) => toMinutes(w.startTime) <= nowMin && nowMin < toMinutes(w.endTime)) ??
    sorted.find((w) => toMinutes(w.startTime) > nowMin);
  if (!current) return `Sessions done for today · last ended ${sorted[sorted.length - 1]!.endTime}`;
  const startHour = toMinutes(current.startTime) / 60;
  const name = startHour < 12 ? 'Morning' : startHour < 16 ? 'Afternoon' : 'Evening';
  const prefix = toMinutes(current.startTime) > nowMin ? 'Next: ' : '';
  return `${prefix}${name} session · ${current.startTime}–${current.endTime} · ${current.slotMinutes}-minute visits`;
}
