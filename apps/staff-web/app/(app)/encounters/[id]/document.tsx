import type { ReactNode } from 'react';

/**
 * Building blocks of the consultation document (design system 14a): a
 * white page cell with a left margin gutter for small context notes. The
 * gutter only appears when the document column is wide enough (a
 * container query on the column, so it adapts to the shell around it).
 */
export function DocRow({
  margin,
  marginClassName = 'pt-4',
  first = false,
  last = false,
  className = '',
  id,
  children,
}: {
  margin?: ReactNode;
  /** Vertical offset so the note lines up with the section heading. */
  marginClassName?: string;
  first?: boolean;
  last?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-28 @[880px]:grid @[880px]:grid-cols-[156px_minmax(0,1fr)] @[880px]:gap-x-6"
    >
      <div
        className={`hidden text-right text-xs leading-[1.5] text-fg-muted @[880px]:block ${marginClassName}`}
      >
        {margin}
      </div>
      <div
        className={[
          'flow-root min-w-0 border-x border-line bg-surface px-5 sm:px-10',
          first ? 'border-t' : '',
          last ? 'border-b pb-8' : '',
          className,
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

/** A numbered section heading: `3. Assessment`, the number in Plex Mono. */
export function SectionHeading({
  number,
  title,
  active = false,
  action,
  id,
}: {
  number: number;
  title: string;
  /** The section being written right now: number in cobalt. */
  active?: boolean;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <h3 id={id} className="text-sm font-semibold text-fg">
        <span
          className={`mr-2 font-mono tabular ${active ? 'text-primary' : 'text-fg-subtle'}`}
          aria-hidden="true"
        >
          {number}.
        </span>
        {title}
      </h3>
      {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
    </div>
  );
}

/** Small text button used inside the document and rail (Add, Order, Amend). */
export function LinkButton({
  children,
  onClick,
  icon,
  tone = 'primary',
  small = false,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  tone?: 'primary' | 'muted' | 'danger';
  /** Secondary row actions (Cancel order): 12px, shorter. */
  small?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const colour =
    tone === 'primary'
      ? 'text-primary hover:text-primary-hover'
      : tone === 'danger'
        ? 'text-danger-fg hover:underline'
        : 'text-fg-muted hover:text-fg';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-control font-medium disabled:pointer-events-none disabled:opacity-50 ${
        small ? 'h-6 px-1 text-xs' : 'h-8 px-1.5 text-[13px]'
      } ${colour}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Heading of a rail block: ink rule, title, optional trailing action. */
export function RailHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-rule flex min-h-10 items-center justify-between pt-1">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {action}
    </div>
  );
}

export interface ParsedRange {
  low: number;
  high: number;
}

/** "4.0 to 5.6", "4.0-5.6", "30 – 100" -> { low, high }. Anything else: undefined. */
export function parseRange(range: string | null | undefined): ParsedRange | undefined {
  if (!range) return undefined;
  const match = range.match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return undefined;
  return { low, high };
}

export function parseValue(value: string): number | undefined {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : undefined;
}

export type RangeFlag = 'LOW' | 'HIGH' | 'NORMAL';

export function rangeFlag(value: number, range: ParsedRange): RangeFlag {
  if (value < range.low) return 'LOW';
  if (value > range.high) return 'HIGH';
  return 'NORMAL';
}

/**
 * The lab Ruler (design system 4): a hairline axis, the normal band, and
 * a tick at the value. Decorative; the value and the word sit beside it.
 */
export function RangeRuler({ value, range }: { value: number; range: ParsedRange }) {
  const lo = Math.min(range.low, value);
  const hi = Math.max(range.high, value);
  const pad = (hi - lo) * 0.2 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (n: number) => `${((n - min) / (max - min)) * 100}%`;
  const out = rangeFlag(value, range) !== 'NORMAL';
  return (
    <div aria-hidden="true" className="relative mt-1.5 h-2.5">
      <div className="absolute inset-x-0 top-[4px] h-px bg-control" />
      <div
        className="absolute top-[1px] h-[7px] border-x border-success-fg bg-success-bg"
        style={{ left: pos(range.low), width: `calc(${pos(range.high)} - ${pos(range.low)})` }}
      />
      <div
        className={`absolute top-0 h-2.5 w-[2px] ${out ? 'bg-warning-fg' : 'bg-fg'}`}
        style={{ left: `calc(${pos(value)} - 1px)` }}
      />
    </div>
  );
}

/** Whole years between a date of birth and today (clinic-local is close enough for age). */
export function ageFrom(dateOfBirth: string, now: Date): number {
  const dob = new Date(dateOfBirth);
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
