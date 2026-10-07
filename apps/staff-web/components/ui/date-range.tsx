'use client';

import { useState } from 'react';
import { clinicToday } from '../../lib/format';
import { Button } from './button';

export interface DateRange {
  /** YYYY-MM-DD, clinic-local, inclusive. */
  from: string;
  to: string;
}

export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

const DAY_MS = 86_400_000;

/** `date` shifted by `days` calendar days (dates are plain YYYY-MM-DD, so work in UTC noon). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days in the range, inclusive. */
export function rangeDays(range: DateRange): number {
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1;
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today = clinicToday()) {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: shiftDate(today, -6), to: today };
    case '30d':
      return { from: shiftDate(today, -29), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

const isDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/**
 * The period selector shared by Reports and Payments: preset chips plus a
 * custom from/to that is validated before it is applied (both dates, from
 * not after to, at most `maxDays`, not in the future). Controlled: the
 * page owns the applied range.
 */
export function DateRangePicker({
  value,
  preset,
  onChange,
  maxDays = 366,
}: {
  value: DateRange;
  preset: RangePreset;
  onChange: (range: DateRange, preset: RangePreset) => void;
  maxDays?: number;
}) {
  const [draft, setDraft] = useState<DateRange>(value);
  const [error, setError] = useState<string>();

  const pick = (key: RangePreset) => {
    setError(undefined);
    if (key === 'custom') {
      setDraft(value);
      onChange(value, 'custom');
      return;
    }
    const next = presetRange(key);
    setDraft(next);
    onChange(next, key);
  };

  const apply = () => {
    const today = clinicToday();
    if (!isDate(draft.from) || !isDate(draft.to)) {
      setError('Enter both dates.');
      return;
    }
    if (draft.from > draft.to) {
      setError('The start date must be on or before the end date.');
      return;
    }
    if (draft.to > today) {
      setError('The end date cannot be in the future.');
      return;
    }
    if (rangeDays(draft) > maxDays) {
      setError(`Choose a period of at most ${maxDays} days.`);
      return;
    }
    setError(undefined);
    onChange(draft, 'custom');
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = p.key === preset;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => pick(p.key)}
              className={`h-9 cursor-pointer rounded-control border px-3.5 text-[13px] font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary-subtle text-primary-subtle-fg'
                  : 'border-control bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label htmlFor="range-from" className="mb-1.5 block text-[13px] font-medium text-fg">
              From
            </label>
            <input
              id="range-from"
              type="date"
              value={draft.from}
              max={clinicToday()}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'range-error' : undefined}
              onChange={(e) => {
                setDraft((d) => ({ ...d, from: e.target.value }));
                setError(undefined);
              }}
              className="h-10 rounded-control border border-control bg-surface px-3 text-base text-fg"
            />
          </div>
          <div>
            <label htmlFor="range-to" className="mb-1.5 block text-[13px] font-medium text-fg">
              To
            </label>
            <input
              id="range-to"
              type="date"
              value={draft.to}
              max={clinicToday()}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'range-error' : undefined}
              onChange={(e) => {
                setDraft((d) => ({ ...d, to: e.target.value }));
                setError(undefined);
              }}
              className="h-10 rounded-control border border-control bg-surface px-3 text-base text-fg"
            />
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {error && (
            <p id="range-error" role="alert" className="basis-full text-[13px] text-danger-fg">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

/** `01 Sep 2026 to 07 Oct 2026`, or the single day. */
export function rangeLabel(range: DateRange): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
      .format(new Date(`${d}T12:00:00+05:30`))
      .replace(/\bSept\b/, 'Sep');
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} to ${fmt(range.to)}`;
}
