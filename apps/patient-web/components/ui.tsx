'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  ArrowLeft,
  CaretRight,
  CircleNotch,
  Info,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react';
import { formatDayNumber, formatMonthShort } from '../lib/format';

/**
 * The patient app's small component set in Clinical Ink (design system
 * 4 and 18): no cards. Sections open with a 1px ink rule, lists are
 * divided by hairlines, controls are sharp (2px) and 48px tall, and a
 * status is a square tag with a word. Client components (Phosphor icons
 * need React context); every patient page is a client page anyway, since
 * the session lives in the browser.
 */

/**
 * A plain block for grouped content. Kept for the few places that need a
 * wrapper; it draws no box, only a hairline above.
 */
export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return <Tag className={`border-t border-line py-5 ${className}`}>{children}</Tag>;
}

/** A ruled row that opens a detail route: content, then a caret. */
export function LinkCard({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-16 items-center gap-4 py-4 transition-colors hover:bg-surface-muted/60 ${className}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <CaretRight
        size={20}
        className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

/** A list divided by hairlines, closed by one below the last row. */
export function Rows({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <ul aria-label={label} className={`divide-y divide-line border-b border-line ${className}`}>
      {children}
    </ul>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-control bg-surface text-fg hover:bg-surface-muted',
  quiet: 'text-primary hover:bg-primary-subtle',
} as const;

type ButtonVariant = keyof typeof BUTTON_VARIANTS;

const buttonClass = (variant: ButtonVariant, full: boolean) =>
  `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control px-5 text-base font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
    BUTTON_VARIANTS[variant]
  } ${full ? 'w-full' : ''}`;

export function Button({
  variant = 'primary',
  full = false,
  loading = false,
  icon,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  full?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, full)}
    >
      {loading ? <CircleNotch size={20} className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  full = false,
  icon,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  full?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, full)}>
      {icon}
      {children}
    </Link>
  );
}

/** "← Records": the way back from a detail page. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 mb-4 inline-flex min-h-12 items-center gap-2 rounded-control px-2 font-medium text-primary hover:bg-primary-subtle"
    >
      <ArrowLeft size={20} aria-hidden="true" />
      {children}
    </Link>
  );
}

/** The one large title of a tab page (28px, no serif in the patient app). */
export function PageTitle({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="mb-1 text-sm text-fg-muted">{eyebrow}</p>}
      <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.01em] text-fg">
        {title}
      </h1>
      {description && <p className="mt-1.5 text-fg-muted">{description}</p>}
    </header>
  );
}

/** A section heading under the 1px ink rule; `action` sits at the right (a count, a link). */
export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1 flex min-h-12 items-baseline justify-between gap-4 border-t border-fg pt-3">
      <h2 className="text-[1.06rem] font-semibold text-fg">{children}</h2>
      {action && <div className="text-sm text-fg-muted">{action}</div>}
    </div>
  );
}

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TAG_TONES: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-neutral-fg',
  primary: 'bg-primary-subtle text-primary-subtle-fg',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg',
};

const TEXT_TONES: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  primary: 'text-primary',
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  info: 'text-info-fg',
};

/** A status in words (never colour alone): a square tag with a small marker. */
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-control px-2 py-0.5 text-sm font-medium ${TAG_TONES[tone]}`}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 bg-current" />
      {children}
    </span>
  );
}

/** A plain coloured word for a status at the end of a row ("Low", "Paid"). */
export function StatusWord({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`text-sm font-semibold ${TEXT_TONES[tone]}`}>{children}</span>;
}

/** The icon at the start of a row: a light glyph, no circle behind it. */
export function IconBadge({ icon: IconComponent, tone = 'neutral' }: { icon: Icon; tone?: Tone }) {
  return (
    <IconComponent
      size={24}
      className={`shrink-0 ${tone === 'neutral' ? 'text-fg' : TEXT_TONES[tone]}`}
      aria-hidden="true"
    />
  );
}

/** A calm note with a 2px rule at its left: cobalt for information. */
export function Note({
  children,
  icon = true,
  className = '',
}: {
  children: ReactNode;
  icon?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 border-l-2 border-primary py-1 pl-4 ${className}`}>
      {icon && <Info size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
}: {
  icon: Icon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start border-b border-line py-8">
      <IconComponent size={28} className="text-fg-muted" aria-hidden="true" />
      <p className="mt-3 font-semibold text-fg">{title}</p>
      <p className="mt-1 max-w-md text-fg-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-l-2 border-danger-fg bg-danger-bg py-3 pl-4 pr-2 text-danger-fg"
    >
      <WarningCircle size={22} aria-hidden="true" />
      <p className="flex-1 font-medium">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-12 cursor-pointer rounded-control px-4 font-semibold underline underline-offset-4"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-muted ${className}`} aria-hidden="true" />;
}

/**
 * The day number set large in Plex Mono with the month under it, closed by
 * a hairline on the right. `muted` for visits that are over.
 */
export function DateTile({ iso, muted = false }: { iso: string; muted?: boolean }) {
  return (
    <div
      className={`flex w-14 shrink-0 flex-col items-center self-start border-r border-line pr-4 ${
        muted ? 'text-fg-muted' : 'text-fg'
      }`}
    >
      <span className="tabular font-mono text-[2rem] font-medium leading-none">
        {formatDayNumber(iso)}
      </span>
      <span className="mt-1 text-sm text-fg-muted">{formatMonthShort(iso)}</span>
    </div>
  );
}

/** Loading placeholder shaped like ruled rows. */
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col divide-y divide-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="py-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
