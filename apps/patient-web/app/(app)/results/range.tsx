'use client';

import { ArrowDown, ArrowUp } from '@phosphor-icons/react';
import type { Tone } from '../../../components/ui';

/**
 * A result against its normal range (design system 4 and 18.3): the
 * Ruler with the normal band, the value tick and labelled ends, plus the
 * verdict in words. The app never interprets beyond in or out of range.
 */

export interface ParsedRange {
  low: number | null;
  high: number | null;
}

export type Verdict = 'within' | 'above' | 'below';

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

/**
 * Reads "70 to 100", "4.0-5.6", "4.0 – 5.6", "<100", "≤ 100", "up to 100",
 * ">40", "40+" into bounds. Anything else gives null.
 */
export function parseRange(text: string | null | undefined): ParsedRange | null {
  if (!text) return null;
  const s = text.trim().toLowerCase().replace(/,/g, '');
  let m = s.match(new RegExp(`^${NUM}\\s*(?:to|-|–|—)\\s*${NUM}`));
  if (m) {
    const low = Number(m[1]);
    const high = Number(m[2]);
    return low <= high ? { low, high } : null;
  }
  m = s.match(new RegExp(`^(?:<|≤|<=|up to|below|less than)\\s*${NUM}`));
  if (m) return { low: null, high: Number(m[1]) };
  m =
    s.match(new RegExp(`^(?:>|≥|>=|above|more than)\\s*${NUM}`)) ??
    s.match(new RegExp(`^${NUM}\\s*\\+`));
  if (m) return { low: Number(m[1]), high: null };
  return null;
}

/** A plain number only ("7.8", "142"); "Positive" or "1:80" give null. */
export function parseValue(text: string): number | null {
  const s = text.trim().replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

export function judge(value: number, range: ParsedRange): Verdict {
  if (range.high !== null && value > range.high) return 'above';
  if (range.low !== null && value < range.low) return 'below';
  return 'within';
}

/** How far a value sits outside the normal band (0 inside it). */
export function distance(value: number, range: ParsedRange): number {
  if (range.high !== null && value > range.high) return value - range.high;
  if (range.low !== null && value < range.low) return range.low - value;
  return 0;
}

/** The ruler's scale: the normal band in the middle, room either side, the value always on it. */
function scale(
  value: number,
  range: ParsedRange,
): { min: number; max: number; from: number; to: number } {
  const low = range.low ?? 0;
  const high = range.high ?? Math.max(low * 2, value * 1.2, low + 1);
  const pad = (high - low || Math.abs(high) || 1) * 0.6;
  const floor = value >= 0 && low >= 0 ? 0 : -Infinity; // no negative ends for positive measures
  const min = Math.max(
    floor,
    Math.min(range.low === null ? Math.min(0, low) : low - pad, value - pad * 0.2),
  );
  const max = Math.max(range.high === null ? high : high + pad, value + pad * 0.2);
  const span = max - min || 1;
  return { min, max, from: ((low - min) / span) * 100, to: ((high - min) / span) * 100 };
}

/** Short word for the end of a row ("Low", "High", "Normal"). */
export const SHORT: Record<Verdict, string> = {
  within: 'Normal',
  above: 'High',
  below: 'Low',
};

/** The word next to a big value. */
export const LONG: Record<Verdict, string> = {
  within: 'Within range',
  above: 'Above range',
  below: 'Below range',
};

export const TONE: Record<Verdict, Tone> = {
  within: 'success',
  above: 'warning',
  below: 'warning',
};

/** A tidy label for an end of the ruler, with as many decimals as the range uses. */
function label(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

function decimalsOf(text: string | null): number {
  const m = text?.match(/\.(\d+)/);
  return m ? Math.min(m[1]!.length, 2) : 0;
}

/** The verdict as an arrow and a word, for the top right of a result. */
export function VerdictWord({ verdict }: { verdict: Verdict }) {
  const Arrow = verdict === 'above' ? ArrowUp : verdict === 'below' ? ArrowDown : null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${
        verdict === 'within' ? 'text-success-fg' : 'text-warning-fg'
      }`}
    >
      {Arrow && <Arrow size={16} weight="regular" aria-hidden="true" />}
      {LONG[verdict]}
    </span>
  );
}

/**
 * The hairline axis with the normal band, the value's tick and the ends
 * labelled; under it, the normal range in words. Without a usable range
 * or number, only the range text (if any) is shown.
 */
export function RangeRuler({
  value,
  referenceRange,
  unit,
}: {
  value: string;
  referenceRange: string | null;
  unit: string | null;
}) {
  const range = parseRange(referenceRange);
  const number = parseValue(value);
  const rangeText = referenceRange
    ? `Normal ${referenceRange.replace(/\s*-\s*/, '–')}${unit ? ` ${unit}` : ''}`
    : null;

  if (!range || number === null) {
    return rangeText ? <p className="text-sm text-fg-muted">{rangeText}</p> : null;
  }

  const verdict = judge(number, range);
  const ok = verdict === 'within';
  const { min, max, from, to } = scale(number, range);
  const at = Math.min(100, Math.max(0, ((number - min) / (max - min || 1)) * 100));
  const dec = Math.max(decimalsOf(referenceRange), decimalsOf(value));

  // Labels: the band edges, and the ruler's ends unless a band label already sits there.
  const marks: Array<{ at: number; text: string; edge?: 'left' | 'right' }> = [];
  if (from > 15) marks.push({ at: 0, text: label(min, dec), edge: 'left' });
  if (range.low !== null) marks.push({ at: from, text: label(range.low, dec) });
  if (range.high !== null) marks.push({ at: to, text: label(range.high, dec) });
  if (to < 85) marks.push({ at: 100, text: label(max, dec), edge: 'right' });

  return (
    <div className="mt-4">
      <div className="relative h-[24px] border-b border-control" aria-hidden="true">
        <div
          className="absolute -bottom-px h-2 border-x border-t border-success-fg bg-success-bg"
          style={{ left: `${from}%`, width: `${Math.max(to - from, 0.5)}%` }}
        />
        <div
          className={`absolute -bottom-px h-[24px] w-[3px] -translate-x-1/2 ${ok ? 'bg-fg' : 'bg-warning-fg'}`}
          style={{ left: `${at}%` }}
        />
      </div>
      <div className="relative mt-1.5 h-5 font-mono text-[0.8rem] text-fg-muted" aria-hidden="true">
        {marks.map((m) => (
          <span
            key={`${m.at}-${m.text}`}
            className={`tabular absolute whitespace-nowrap ${
              m.edge === 'left'
                ? ''
                : m.edge === 'right'
                  ? '-translate-x-full'
                  : m.at < 6
                    ? ''
                    : m.at > 94
                      ? '-translate-x-full'
                      : '-translate-x-1/2'
            }`}
            style={{ left: `${m.at}%` }}
          >
            {m.text}
          </span>
        ))}
      </div>
      {rangeText && <p className="mt-1.5 text-sm text-fg-muted">{rangeText}</p>}
    </div>
  );
}
