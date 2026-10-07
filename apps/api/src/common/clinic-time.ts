/**
 * Clinic-local day boundaries for "today's queue" and a doctor's daily
 * calendar. Fixed to India Standard Time (no DST, so a constant offset
 * is exact). TODO(product): per-organization/clinic timezone once a
 * settings table exists — open-questions.md#16.
 */
export const CLINIC_TIMEZONE = 'Asia/Kolkata';
const CLINIC_UTC_OFFSET = '+05:30';

/** The clinic-local calendar date of an instant, as YYYY-MM-DD. */
export function clinicDateString(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** [start, end) instants of a clinic-local calendar date. */
export function clinicDayRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00.000${CLINIC_UTC_OFFSET}`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

/** A clinic-local date as the UTC-midnight Date Prisma expects for @db.Date columns. */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
