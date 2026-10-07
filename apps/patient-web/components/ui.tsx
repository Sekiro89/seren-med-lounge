'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CaretRight, CircleNotch, WarningCircle, type Icon } from '@phosphor-icons/react';
import { formatDayNumber, formatMonthShort } from '../lib/format';

/**
 * The patient app's small component set (design system 18.5): 16px cards,
 * 12px controls at 48px tall, pill chips. Client components (Phosphor
 * icons need React context); every patient page is a client page anyway,
 * since the session lives in the browser.
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
  return (
    <Tag
      className={`rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  );
}

/** A tappable card row that opens a detail route. */
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
      className={`group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-transform active:scale-[0.99] sm:p-6 ${className}`}
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

const BUTTON_VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-muted',
  quiet: 'text-primary hover:bg-primary-subtle',
  onDeep: 'bg-brand-deep-fg text-brand-deep hover:bg-white',
} as const;

type ButtonVariant = keyof typeof BUTTON_VARIANTS;

const buttonClass = (variant: ButtonVariant, full: boolean) =>
  `inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
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

export function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-fg">{title}</h1>
      {description && <p className="mt-2 text-fg-muted">{description}</p>}
    </header>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-[1.12rem] font-bold text-fg">{children}</h2>
      {action}
    </div>
  );
}

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const CHIP_TONES: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-neutral-fg',
  primary: 'bg-primary-subtle text-primary-subtle-fg',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg',
};

/** A status in words (never colour alone). */
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Round icon badge used at the start of rows and empty states. */
export function IconBadge({ icon: IconComponent, tone = 'primary' }: { icon: Icon; tone?: Tone }) {
  return (
    <span
      className={`flex size-12 shrink-0 items-center justify-center rounded-full ${CHIP_TONES[tone]}`}
    >
      <IconComponent size={24} aria-hidden="true" />
    </span>
  );
}

export function EmptyState({
  icon,
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
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <IconBadge icon={icon} tone="neutral" />
      <p className="mt-4 font-bold text-fg">{title}</p>
      <p className="mt-1 max-w-sm text-fg-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-bg px-5 py-4 text-danger-fg"
    >
      <WarningCircle size={22} aria-hidden="true" />
      <p className="flex-1 font-semibold">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-12 cursor-pointer rounded-xl px-4 font-semibold underline underline-offset-4"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-surface-muted ${className}`} aria-hidden="true" />
  );
}

/**
 * Month and day number in a rounded tile, for visit cards. `muted` for
 * visits that are over, so upcoming ones stand out.
 */
export function DateTile({ iso, muted = false }: { iso: string; muted?: boolean }) {
  return (
    <div
      className={`flex w-16 shrink-0 flex-col items-center justify-center self-start rounded-2xl py-3 ${
        muted ? 'bg-surface-muted text-fg-muted' : 'bg-primary-subtle text-primary-subtle-fg'
      }`}
    >
      <span className="text-sm font-bold uppercase">{formatMonthShort(iso)}</span>
      <span className="tabular text-3xl font-bold leading-none">{formatDayNumber(iso)}</span>
    </div>
  );
}

/** Loading placeholder shaped like a stack of cards. */
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}
