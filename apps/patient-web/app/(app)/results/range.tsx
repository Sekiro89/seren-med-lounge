'use client';

/**
 * A result against its normal range (design system 18.3): a small bar with
 * the normal band and a marker, plus the verdict in words. The app never
 * interprets beyond in or out of range.
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

/** The bar's scale: the normal band in the middle, room either side, the value always on it. */
function scale(
  value: number,
  range: ParsedRange,
): { min: number; max: number; from: number; to: number } {
  const low = range.low ?? 0;
  const high = range.high ?? Math.max(low * 2, value * 1.2, low + 1);
  const pad = (high - low || Math.abs(high) || 1) * 0.6;
  const min = Math.min(range.low === null ? Math.min(0, low) : low - pad, value - pad * 0.2);
  const max = Math.max(range.high === null ? high : high + pad, value + pad * 0.2);
  const span = max - min || 1;
  return { min, max, from: ((low - min) / span) * 100, to: ((high - min) / span) * 100 };
}

const WORDS: Record<Verdict, string> = {
  within: 'Within the normal range',
  above: 'Above the normal range',
  below: 'Below the normal range',
};

export function RangeIndicator({
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
    ? `Normal range: ${referenceRange}${unit ? ` ${unit}` : ''}`
    : null;

  if (!range || number === null) {
    return rangeText ? <p className="text-sm text-fg-muted">{rangeText}</p> : null;
  }

  const verdict = judge(number, range);
  const ok = verdict === 'within';
  const { min, max, from, to } = scale(number, range);
  const at = Math.min(100, Math.max(0, ((number - min) / (max - min || 1)) * 100));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-3" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-muted" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-success-bg ring-1 ring-success-fg/40"
          style={{ left: `${from}%`, width: `${to - from}%` }}
        />
        <div
          className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${
            ok ? 'bg-success-fg' : 'bg-warning-fg'
          }`}
          style={{ left: `${at}%` }}
        />
      </div>
      <p className={`font-semibold ${ok ? 'text-success-fg' : 'text-warning-fg'}`}>
        {WORDS[verdict]}
      </p>
      {rangeText && <p className="text-sm text-fg-muted">{rangeText}</p>}
    </div>
  );
}
