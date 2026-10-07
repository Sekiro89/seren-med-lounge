import type { ReactNode } from 'react';
import { statusLabel, statusTone, type StatusDomain, type Tone } from '../../lib/status';
import { Skeleton } from './skeleton';

/**
 * Clinical Ink page furniture (design system 4 and 14a), shared by the
 * desk pages so they read like the consultation document and the doctor's
 * Today: one white sheet, a Plex Serif title beside a strip of figures,
 * 1px ink section rules, hairline rows, quiet margin notes and a right
 * rail of actions. No boxes, no shadows.
 */

/** The white sheet a page sits on: one hairline border, square corners. */
export function InkSheet({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`border border-line bg-surface ${className}`}>{children}</div>;
}

export interface Figure {
  label: string;
  value: ReactNode;
  /** Small grey unit after the number ("min", "items"). */
  unit?: string;
  /** A second line under the number, in small grey text. */
  hint?: ReactNode;
  /** Colour the number for a state (always with a word in the label or hint). */
  tone?: 'warning' | 'danger';
}

/**
 * The figures strip: a small label above a big Plex Mono number, split by
 * hairlines. Real numbers only; a skeleton while loading.
 */
export function Figures({
  items,
  loading,
  size = 'md',
  className = '',
}: {
  items: Figure[];
  loading?: boolean;
  /** `md` 28px (page heads), `sm` 22px (rails and money-heavy strips). */
  size?: 'md' | 'sm';
  className?: string;
}) {
  return (
    <dl className={`flex flex-wrap items-start gap-y-4 ${className}`}>
      {items.map((f, i) => (
        <div
          key={f.label}
          className={
            i === 0
              ? 'pr-7'
              : i === items.length - 1
                ? 'border-l border-line pl-7'
                : 'border-l border-line px-7'
          }
        >
          <dt className="whitespace-nowrap text-[12px] text-fg-muted">{f.label}</dt>
          <dd
            className={`tabular mt-1 whitespace-nowrap font-mono leading-none ${
              size === 'md' ? 'text-[28px]' : 'text-[22px]'
            } ${
              f.tone === 'danger'
                ? 'text-danger-fg'
                : f.tone === 'warning'
                  ? 'text-warning-fg'
                  : 'text-fg'
            }`}
          >
            {loading ? (
              <Skeleton className={size === 'md' ? 'h-7 w-12' : 'h-6 w-16'} />
            ) : (
              <>
                {f.value ?? '-'}
                {f.unit && f.value !== undefined && f.value !== null && (
                  <span className="ml-1 text-[14px] text-fg-muted">{f.unit}</span>
                )}
              </>
            )}
          </dd>
          {f.hint && !loading && (
            <dd className="mt-1.5 whitespace-nowrap text-[12px] text-fg-subtle">{f.hint}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * The head of a sheet: an optional mono eyebrow, the one serif title on the
 * page, a one-line description, the figures at the right and the page's
 * actions after them.
 */
export function SheetHead({
  eyebrow,
  title,
  description,
  figures,
  action,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  figures?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-5 border-b border-line px-5 pb-5 pt-6 sm:px-8">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            {eyebrow}
          </p>
        )}
        <h1 className="font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.01em] text-fg">
          {title}
        </h1>
        {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {(figures || action) && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 lg:ml-auto">
          {figures}
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
    </div>
  );
}

/** A quiet row under the head: filters on the left, small actions on the right. */
export function SheetBar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-2 sm:px-8">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Text filters in the Today style: the selected one underlined in ink, the
 * rest grey. A count, when given, sits after the word in Plex Mono.
 */
export function InkFilters<K extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: K;
  onChange: (key: K) => void;
  options: Array<{ key: K; label: string; count?: number }>;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]"
      role="group"
      aria-label={label}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`inline-flex cursor-pointer items-baseline gap-1.5 border-b-2 pb-0.5 ${
              on
                ? 'border-fg font-medium text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={`tabular font-mono text-[12px] ${on ? 'text-fg' : 'text-fg-subtle'}`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A section in a sheet: the 1px ink rule, a heading (optionally numbered
 * like the consultation, the number in Plex Mono) and a trailing action.
 */
export function InkSection({
  number,
  title,
  meta,
  action,
  id,
  className = '',
  children,
}: {
  number?: number;
  title: string;
  /** Small grey text after the title (a count, a period). */
  meta?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const headingId = id ? `${id}-h` : undefined;
  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="section-rule flex min-h-10 flex-wrap items-center gap-x-3 pt-1">
        <h2 id={headingId} className="text-sm font-semibold text-fg">
          {number !== undefined && (
            <span className="tabular mr-2 font-mono text-fg-subtle" aria-hidden="true">
              {number}.
            </span>
          )}
          {title}
        </h2>
        {meta && <span className="text-[12px] text-fg-muted">{meta}</span>}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** The right rail beside a sheet's main column: hairline on the left, quiet padding. */
export function SheetRail({
  children,
  label,
  className = '',
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <aside
      aria-label={label}
      className={`flex min-w-0 flex-col gap-6 border-t border-line px-5 pb-8 pt-5 sm:px-7 lg:border-l lg:border-t-0 ${className}`}
    >
      {children}
    </aside>
  );
}

/** A small grey note, the margin voice of the consultation document. */
export function MarginNote({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`text-xs leading-[1.5] text-fg-muted ${className}`}>{children}</p>;
}

/** A label and value on one hairline row: `Subtotal ........ ₹1,200.00`. */
export function LedgerLine({
  label,
  value,
  strong,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  tone?: 'muted' | 'danger' | 'success';
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1.5 text-[13px] ${
        strong ? 'font-semibold text-fg' : 'text-fg'
      }`}
    >
      <dt className={strong ? '' : 'text-fg-muted'}>{label}</dt>
      <dd
        className={`tabular font-mono ${
          tone === 'danger'
            ? 'text-danger-fg'
            : tone === 'success'
              ? 'text-success-fg'
              : tone === 'muted'
                ? 'text-fg-muted'
                : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * A ruled bar: a hairline track and an ink (or cobalt) bar, the number in
 * text beside it so the length is never the only signal.
 */
export function RuledBar({
  value,
  max,
  tone = 'ink',
  className = '',
}: {
  value: number;
  max: number;
  tone?: 'ink' | 'primary' | 'muted' | 'warning' | 'danger';
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  const fill =
    tone === 'primary'
      ? 'bg-primary'
      : tone === 'muted'
        ? 'bg-control'
        : tone === 'warning'
          ? 'bg-warning-fg'
          : tone === 'danger'
            ? 'bg-danger'
            : 'bg-fg';
  return (
    <div aria-hidden="true" className={`relative h-[5px] ${className}`}>
      <div className="absolute inset-x-0 top-[2px] h-px bg-line" />
      <div
        className={`absolute left-0 top-0 h-[5px] ${fill}`}
        style={{ width: value > 0 ? `max(2px, ${pct}%)` : 0 }}
      />
    </div>
  );
}

/**
 * The stock Ruler (design system 4, like the lab range ruler): a hairline
 * axis from zero, a hatched band up to the reorder level, an ink bar for
 * what is on hand and a tick at the reorder level. Decorative; the numbers
 * and the word sit beside it.
 */
export function LevelRuler({
  value,
  reorder,
  max,
  className = '',
}: {
  value: number;
  reorder?: number | null;
  /** The right end of the axis; defaults to twice the reorder level or the value. */
  max?: number;
  className?: string;
}) {
  const level = reorder ?? 0;
  const end = Math.max(1, max ?? Math.max(level * 2, value, 1));
  const pos = (n: number) => `${Math.min(100, (Math.max(0, n) / end) * 100)}%`;
  const below = level > 0 && value <= level;
  return (
    <div aria-hidden="true" className={`relative h-3 ${className}`}>
      {level > 0 && (
        <div
          className="absolute top-[2px] h-[7px]"
          style={{
            left: 0,
            width: pos(level),
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 3px, var(--line) 3px 4px)',
          }}
        />
      )}
      <div className="absolute inset-x-0 top-[5px] h-px bg-control" />
      <div
        className={`absolute top-[3px] h-[5px] ${
          value === 0 ? '' : below ? 'bg-warning-fg' : 'bg-fg'
        }`}
        style={{ left: 0, width: value > 0 ? `max(2px, ${pos(value)})` : 0 }}
      />
      {level > 0 && (
        <div className="absolute top-0 h-3 w-px bg-fg-muted" style={{ left: pos(level) }} />
      )}
      {value === 0 && <div className="absolute left-0 top-0 h-3 w-[2px] bg-danger" />}
    </div>
  );
}

const STATUS_INK: Record<Tone, { text: string; marker: string }> = {
  neutral: { text: 'text-fg-muted', marker: 'bg-control' },
  info: { text: 'text-primary-subtle-fg', marker: 'bg-primary' },
  warning: { text: 'text-warning-fg', marker: 'bg-warning-fg' },
  success: { text: 'text-success-fg', marker: 'bg-success-fg' },
  danger: { text: 'text-danger-fg', marker: 'bg-danger' },
};

/**
 * A status in the agenda style of Today: a 6px square marker and the word
 * in the status colour, no tint. Lighter than Badge for dense ledgers.
 */
export function StatusWord({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const s = STATUS_INK[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] ${s.text}`}>
      <span aria-hidden="true" className={`size-1.5 shrink-0 ${s.marker}`} />
      {children}
    </span>
  );
}

/** A domain status as a StatusWord, with the one mapping from lib/status. */
export function InkStatus({ domain, status }: { domain: StatusDomain; status: string }) {
  return <StatusWord tone={statusTone(domain, status)}>{statusLabel(status)}</StatusWord>;
}

/** Hatched fill for closed or unavailable zones on a ruler. */
export const HATCH_STYLE = {
  backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 5px, var(--line) 5px 6px)',
} as const;
