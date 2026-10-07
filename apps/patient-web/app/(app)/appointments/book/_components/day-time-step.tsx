'use client';

import { useEffect, useState } from 'react';
import { CalendarX } from '@phosphor-icons/react';
import { EmptyState, ErrorNote, SectionHeading, Skeleton } from '../../../../../components/ui';
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

/**
 * Step 3: a row of the next 14 days, then the doctor's free times on the
 * chosen day, grouped by part of the day. Until the patient picks a day
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
  const nextWorkingDay = (after: string) =>
    days.find((d) => d.date > after && doctor.days.includes(d.weekday))?.date;
  const advance = () => {
    const next = date ? nextWorkingDay(date) : undefined;
    if (next) onDate(next);
  };

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="pick-day">
        <SectionHeading>
          <span id="pick-day">Day</span>
        </SectionHeading>
        <ul
          className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6"
          aria-label="Next two weeks"
        >
          {days.map((day, i) => {
            const works = doctor.days.includes(day.weekday);
            const selected = day.date === date;
            const iso = dayIso(day.date);
            const showMonth =
              i === 0 || formatMonthShort(iso) !== formatMonthShort(dayIso(days[i - 1]!.date));
            return (
              <li key={day.date} className="snap-start">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={!works || undefined}
                  aria-label={`${formatDay(iso)}${works ? '' : ', the doctor is not in'}`}
                  onClick={() => {
                    if (!works) return;
                    setPicked(true);
                    onDate(day.date);
                  }}
                  className={`flex min-h-20 w-16 flex-col items-center justify-center rounded-xl border transition active:scale-[0.98] ${
                    selected
                      ? 'border-primary bg-primary text-on-primary'
                      : works
                        ? 'cursor-pointer border-line bg-surface text-fg hover:bg-surface-muted'
                        : 'cursor-not-allowed border-line bg-surface-muted text-fg-subtle line-through'
                  }`}
                >
                  <span className="text-sm font-semibold">{formatWeekdayShort(iso)}</span>
                  <span className="tabular text-xl font-bold leading-tight">
                    {formatDayNumber(iso)}
                  </span>
                  {showMonth && <span className="text-sm">{formatMonthShort(iso)}</span>}
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
  onNoTimes,
}: {
  doctorId: string;
  date: string;
  slot: Slot | undefined;
  onSlot: (slot: Slot) => void;
  /** Called once when the day turns out to have no free times. */
  onNoTimes?: () => void;
}) {
  const slots = useApi<Array<Slot & { available?: boolean }>>(
    `/patients/me/booking/doctors/${doctorId}/slots?date=${date}`,
  );
  const free = (slots.data ?? []).filter((s) => s.available !== false);
  const empty = slots.data !== undefined && free.length === 0;

  useEffect(() => {
    if (empty) onNoTimes?.();
    // Only when this day's answer arrives; onNoTimes changes identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty]);

  return (
    <section aria-labelledby="pick-time">
      <SectionHeading>
        <span id="pick-time">Time on {formatDay(dayIso(date))}</span>
      </SectionHeading>
      {slots.loading ? (
        <div
          className="grid grid-cols-3 gap-3 sm:grid-cols-4"
          aria-busy="true"
          aria-label="Loading"
        >
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
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
        <div className="flex flex-col gap-6">
          {PERIODS.map((period) => {
            const group = free.filter((s) => period.test(Number(formatTime(s.start).slice(0, 2))));
            if (group.length === 0) return null;
            return (
              <div key={period.label}>
                <h3 className="mb-3 font-semibold text-fg-muted">{period.label}</h3>
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {group.map((s) => {
                    const selected = s.start === slot?.start;
                    return (
                      <li key={s.start}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onSlot({ start: s.start, end: s.end })}
                          className={`tabular min-h-12 w-full cursor-pointer rounded-xl border text-lg font-semibold transition active:scale-[0.98] ${
                            selected
                              ? 'border-primary bg-primary text-on-primary'
                              : 'border-line bg-surface text-fg hover:bg-surface-muted'
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
        </div>
      )}
    </section>
  );
}
