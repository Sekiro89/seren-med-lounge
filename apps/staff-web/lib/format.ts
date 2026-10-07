/**
 * Display formatting from docs/design/DESIGN_SYSTEM.md section 14.
 * The clinic runs on India time; the API sends money in paise.
 */
const CLINIC_TZ = 'Asia/Kolkata';

/** The clinic-local calendar date as YYYY-MM-DD (matches the API's day boundaries). */
export function clinicToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** `14:30`, 24-hour, clinic time. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// Newer ICU data abbreviates September as "Sept" in en-GB; the design system uses "Sep".
const shortSep = (text: string) => text.replace(/\bSept\b/, 'Sep');

/** `07 Oct 2026`. */
export function formatDate(iso: string): string {
  return shortSep(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: CLINIC_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso)),
  );
}

/** `Wednesday, 07 Oct 2026`. */
export function formatLongDate(iso: string | Date): string {
  return shortSep(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: CLINIC_TZ,
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(typeof iso === 'string' ? new Date(iso) : iso),
  );
}

/** Paise to rupees, Indian digit grouping: 12345000 -> ₹1,23,450.00 */
export function formatMoney(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100);
}

/** `Meera Iyer`, from the pieces the API returns. */
export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/** `ADMINISTRATOR` -> `Administrator`, `SENIOR_DOCTOR` -> `Senior doctor`. */
export function humanize(value: string): string {
  const text = value.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What to call someone in a greeting: "Dr. Kavita Rao" -> "Dr. Kavita",
 * "Anjali Menon" -> "Anjali".
 */
export function greetingName(fullNameValue: string): string {
  const parts = fullNameValue.trim().split(/\s+/);
  return parts[0]?.endsWith('.') && parts[1] ? `${parts[0]} ${parts[1]}` : (parts[0] ?? '');
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => !part.endsWith('.'))
    .slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}
