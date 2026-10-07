/**
 * Display formatting (design system section 14). The clinic runs on India
 * time and the API sends money in paise.
 */
const CLINIC_TZ = 'Asia/Kolkata';

// Newer ICU data abbreviates September as "Sept" in en-GB; the design system uses "Sep".
const fmt = (options: Intl.DateTimeFormatOptions, iso: string | Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TZ, ...options })
    .format(typeof iso === 'string' ? new Date(iso) : iso)
    .replace(/\bSept\b/, 'Sep');

/** `14:30` */
export const formatTime = (iso: string) =>
  fmt({ hour: '2-digit', minute: '2-digit', hour12: false }, iso);

/** `7 Oct 2026` */
export const formatDate = (iso: string) =>
  fmt({ day: 'numeric', month: 'short', year: 'numeric' }, iso);

/** `Wednesday, 14 October` */
export const formatDay = (iso: string) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long' }, iso);

/** `5 September` */
export const formatDayMonth = (iso: string) => fmt({ day: 'numeric', month: 'long' }, iso);

/** `October 2026` */
export const formatMonthYear = (iso: string) => fmt({ month: 'long', year: 'numeric' }, iso);

/** `2026-10-07` in clinic time, for grouping by day. */
export const clinicDayKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date(iso));

/** `Wed` and `14` for a date tile. */
export const formatWeekdayShort = (iso: string) => fmt({ weekday: 'short' }, iso);
export const formatDayNumber = (iso: string) => fmt({ day: 'numeric' }, iso);
export const formatMonthShort = (iso: string) => fmt({ month: 'short' }, iso);

/** Paise to rupees with Indian grouping: 120000 -> ₹1,200 (no paise when whole). */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
  }).format(rupees);
}

/** "in 6 days", "tomorrow", "today", or "3 days ago", by clinic calendar day. */
export function relativeDay(iso: string): string {
  const day = (d: Date) =>
    Date.UTC(
      ...(fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }, d)
        .split('/')
        .reverse()
        .map(Number) as [number, number, number]),
    );
  const diff = Math.round((day(new Date(iso)) - day(new Date())) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** Age in whole years from a date of birth. */
export function ageFrom(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** "Dr. Meera Iyer" stays as is; a bare name gets no title added. */
export const doctorName = (doctor: { fullName: string } | null | undefined) =>
  doctor?.fullName ?? 'Your doctor';

/** Course length in words: 56 -> "8 weeks", 30 -> "30 days", 1 -> "1 day". */
export function courseLength(days: number): string {
  if (days % 7 === 0 && days >= 14) return `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** An Indian mobile number in two groups of five: 9890123456 -> "98901 23456". */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return local.length === 10 ? `${local.slice(0, 5)} ${local.slice(5)}` : phone;
}
