/**
 * Whether a lab result falls outside its reference range, for the
 * doctor's inbox. Ranges are free text entered by the lab desk, so only
 * the common shapes are understood: "70 to 100", "4.0-5.6", "<100",
 * "<=100", ">40", ">=40" (an optional trailing unit is ignored). The
 * value must be a plain number, optionally followed by a unit. Anything
 * else returns null: an unparseable result is never flagged.
 */
const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const BETWEEN = new RegExp(String.raw`^\s*${NUM}\s*(?:-|–|—|to)\s*${NUM}\s*[^\d]*$`, 'i');
const BELOW = new RegExp(String.raw`^\s*(<=|≤|<)\s*${NUM}\s*[^\d]*$`);
const ABOVE = new RegExp(String.raw`^\s*(>=|≥|>)\s*${NUM}\s*[^\d]*$`);
const VALUE = new RegExp(String.raw`^\s*${NUM}\s*[a-zA-Zµ%/^*\d.]*\s*$`);

export type AbnormalDirection = 'low' | 'high';

export function parseResultValue(value: string): number | null {
  const match = VALUE.exec(value);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function abnormalDirection(
  resultValue: string,
  referenceRange: string | null | undefined,
): AbnormalDirection | null {
  if (!referenceRange) return null;
  const value = parseResultValue(resultValue);
  if (value === null) return null;

  const between = BETWEEN.exec(referenceRange);
  if (between) {
    const low = Number(between[1]);
    const high = Number(between[2]);
    if (!(low <= high)) return null;
    if (value < low) return 'low';
    if (value > high) return 'high';
    return null;
  }
  const below = BELOW.exec(referenceRange);
  if (below) {
    const limit = Number(below[2]);
    const inclusive = below[1] !== '<';
    return (inclusive ? value > limit : value >= limit) ? 'high' : null;
  }
  const above = ABOVE.exec(referenceRange);
  if (above) {
    const limit = Number(above[2]);
    const inclusive = above[1] !== '>';
    return (inclusive ? value < limit : value <= limit) ? 'low' : null;
  }
  return null;
}
