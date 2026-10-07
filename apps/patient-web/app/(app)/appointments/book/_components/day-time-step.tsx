'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarX } from '@phosphor-icons/react';
import { EmptyState, ErrorNote, Skeleton } from '../../../../../components/ui';
import {
  formatDay,
  formatDayNumber,
  formatMonthShort,
  formatTime,
  formatWeekdayShort,
} from '../../../../../lib/format';
import type { BookingDoctor, Slot } from '../../../../../lib/types';
import { useApi } from '../../../../../lib/use-api';

/** A clinic calendar day, `YYYY-MM-DD`, with its weekday (0 = Sunday). */
export interface BookingDay {
  date: string;
  weekday: number;
}

/** Noon in clinic time on that day, so lib/format prints the right date. */
export const dayIso = (date: string) => `${date}T12:00:00+05:30`;

/** The next `count` days from clinic `today` (`YYYY-MM-DD`, Asia/Kolkata). */
export function nextDays(today: string, count: number): BookingDay[] {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    return { date: day.toISOString().slice(0, 10), weekday: day.getUTCDay() };
  });
}

const PERIODS = [
  { label: 'Morning', test: (h: number) => h < 12 },
  { label: 'Afternoon', test: (h: number) => h >= 12 && h < 17 },
  { label: 'Evening', test: (h: number) => h >= 17 },
];

/** A day's word under its number: from what the clinic told us about it, never guessed. */
function dayWord(works: boolean, free: number | undefined): { word: string; tone: string } {
  if (!works) return { word: 'Closed', tone: 'text-fg-subtle' };
  if (free === 0) return { word: 'Full', tone: 'text-fg-subtle' };
  if (free !== undefined && free <= 3) return { word: 'Few left', tone: 'text-warning-fg' };
  return { word: 'Open', tone: 'text-success-fg' };
}

/**
 * Step 3: the next 14 days as a ruled strip (five to a screen), then the
 * doctor's times on the chosen day, grouped by part of the day; taken
 * times stay in place, struck through. Until the patient picks a day
 * themselves, a day with nothing left (say, this evening) moves on to the
 * doctor's next working day, so the first screen shows real times.
 */
export function DayTimeStep({
  doctor,
  days,
  date,
  slot,
  onDate,
  onSlot,
}: {
  doctor: BookingDoctor;
  days: BookingDay[];
  date: string | undefined;
  slot: Slot | undefined;
  onDate: (date: string) => void;
  onSlot: (slot: Slot) => void;
}) {
  const [picked, setPicked] = useState(false);
  // Free times per day, learned as each day is opened ("Few left", "Full").
  const [freeByDay, setFreeByDay] = useState<Record<string, number>>({});
  const nextWorkingDay = (after: string) =>
    days.find((d) => d.date > after && doctor.days.includes(d.weekday))?.date;
  const advance = () => {
    const next = date ? nextWorkingDay(date) : undefined;
    if (next) onDate(next);
  };

  // Keep the chosen day in view inside the strip (scrolls the strip only, not the page).
  const strip = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = strip.current;
    const cell = list?.querySelector<HTMLElement>('[aria-pressed="true"]')?.parentElement;
    if (!list || !cell) return;
    if (cell.offsetLeft < list.scrollLeft) list.scrollLeft = cell.offsetLeft;
    else if (cell.offsetLeft + cell.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollLeft = cell.offsetLeft + cell.offsetWidth - list.clientWidth;
  }, [date]);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Day">
        <ul
          ref={strip}
          className="relative flex overflow-x-auto border border-line"
          aria-label="Next two weeks"
        >
          {days.map((day, i) => {
            const works = doctor.days.includes(day.weekday);
            const selected = day.date === date;
            const iso = dayIso(day.date);
            const showMonth =
              i === 0 || formatMonthShort(iso) !== formatMonthShort(dayIso(days[i - 1]!.date));
            const { word, tone } = dayWord(works, freeByDay[day.date]);
            return (
              <li
                key={day.date}
                className={`w-1/5 shrink-0 ${i > 0 ? 'border-l border-line' : ''}`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={!works || undefined}
                  aria-label={`${formatDay(iso)}, ${works ? word.toLowerCase() : 'the doctor is not in'}`}
                  onClick={() => {
                    if (!works) return;
                    setPicked(true);
                    onDate(day.date);
                  }}
                  className={`flex h-full min-h-20 w-full flex-col items-center justify-center py-2 transition-colors ${
                    selected
                      ? 'bg-primary text-on-primary'
                      : works
                        ? 'cursor-pointer bg-surface text-fg hover:bg-surface-muted'
                        : 'cursor-not-allowed bg-surface-muted text-fg-subtle'
                  }`}
                >
                  <span className={`text-sm ${selected ? '' : 'text-fg-muted'}`}>
                    {formatWeekdayShort(iso)}
                    {showMonth && ` ${formatMonthShort(iso)}`}
                  </span>
                  <span className="tabular font-mono text-[1.3rem] leading-tight">
                    {formatDayNumber(iso)}
                  </span>
                  <span className={`text-sm ${selected ? 'font-medium' : tone}`}>{word}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {date ? (
        <TimeGrid
          key={date}
          doctorId={doctor.id}
          date={date}
          slot={slot}
          onSlot={onSlot}
          onFree={(free) => setFreeByDay((m) => (m[date] === free ? m : { ...m, [date]: free }))}
          onNoTimes={picked ? undefined : advance}
        />
      ) : (
        <EmptyState
          icon={CalendarX}
          title="No days open in the next two weeks"
          description="Please call the clinic and we will find you a time."
        />
      )}
    </div>
  );
}

/** Keyed by date, so a new day starts with a fresh load. */
function TimeGrid({
  doctorId,
  date,
  slot,
  onSlot,
  onFree,
  onNoTimes,
}: {
  doctorId: string;
  date: string;
  slot: Slot | undefined;
  onSlot: (slot: Slot) => void;
  /** Told how many times are free once the day's answer arrives. */
  onFree: (free: number) => void;
  /** Called once when the day turns out to have no free times. */
  onNoTimes?: () => void;
}) {
  const slots = useApi<Array<Slot & { available?: boolean }>>(
    `/patients/me/booking/doctors/${doctorId}/slots?date=${date}`,
  );
  const all = slots.data ?? [];
  const free = all.filter((s) => s.available !== false);
  const empty = slots.data !== undefined && free.length === 0;
  const anyTaken = free.length < all.length;

  useEffect(() => {
    if (slots.data !== undefined) onFree(free.length);
    if (empty) onNoTimes?.();
    // Only when this day's answer arrives; the callbacks change identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.data]);

  return (
    <section aria-labelledby="pick-time">
      <h2 id="pick-time" className="sr-only">
        Times on {formatDay(dayIso(date))}
      </h2>
      {slots.loading ? (
        <div
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          aria-busy="true"
          aria-label="Loading"
        >
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : slots.error ? (
        <ErrorNote message={slots.error} onRetry={slots.reload} />
      ) : free.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="No free times on this day"
          description="Try another day."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {PERIODS.map((period) => {
            const group = all.filter((s) => period.test(Number(formatTime(s.start).slice(0, 2))));
            if (group.length === 0) return null;
            const open = group.filter((s) => s.available !== false).length;
            return (
              <div key={period.label}>
                <div className="flex items-baseline justify-between border-b border-fg pb-1.5">
                  <h3 className="font-semibold">{period.label}</h3>
                  <p className="text-sm text-fg-muted">
                    <span className="font-mono">{open}</span> free
                  </p>
                </div>
                <ul className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {group.map((s) => {
                    const taken = s.available === false;
                    const selected = !taken && s.start === slot?.start;
                    return (
                      <li key={s.start}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-disabled={taken || undefined}
                          aria-label={taken ? `${formatTime(s.start)}, taken` : undefined}
                          onClick={() => {
                            if (!taken) onSlot({ start: s.start, end: s.end });
                          }}
                          className={`tabular h-12 w-full rounded-control font-mono text-base transition-colors ${
                            taken
                              ? 'cursor-not-allowed bg-surface-muted text-fg-subtle line-through'
                              : selected
                                ? 'cursor-pointer bg-primary font-medium text-on-primary'
                                : 'cursor-pointer border border-control bg-surface text-fg hover:border-fg'
                          }`}
                        >
                          {formatTime(s.start)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {anyTaken && <p className="text-sm text-fg-muted">Struck-through times are taken.</p>}
        </div>
      )}
    </section>
  );
}
