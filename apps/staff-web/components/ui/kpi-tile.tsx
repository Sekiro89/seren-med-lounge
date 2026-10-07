import Link from 'next/link';
import type { Icon } from '@phosphor-icons/react';
import { Skeleton } from './skeleton';

export type KpiTone = 'primary' | 'info' | 'warning' | 'success' | 'danger';

const ICON_TONES: Record<KpiTone, string> = {
  primary: 'bg-primary-subtle text-primary-subtle-fg',
  info: 'bg-info-bg text-info-fg',
  warning: 'bg-warning-bg text-warning-fg',
  success: 'bg-success-bg text-success-fg',
  danger: 'bg-danger-bg text-danger-fg',
};

/**
 * One number a role cares about. Real data only: a skeleton while loading,
 * and the tile isn't rendered at all for a role without the permission
 * behind it. With `href` the whole tile is a link to the desk that owns it.
 */
export function KpiTile({
  label,
  value,
  hint,
  icon: IconComponent,
  loading,
  tone = 'primary',
  href,
}: {
  label: string;
  value: string | number | undefined;
  hint?: string;
  icon: Icon;
  loading?: boolean;
  tone?: KpiTone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-fg-muted">{label}</p>
        <span
          className={`flex size-9 items-center justify-center rounded-control ${ICON_TONES[tone]}`}
        >
          <IconComponent size={20} aria-hidden="true" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-9 w-24" />
      ) : (
        <p className="tabular mt-4 font-mono text-[30px] font-semibold leading-9 tracking-tight text-fg">
          {value ?? '-'}
        </p>
      )}
      {hint && <p className="mt-1.5 text-[13px] text-fg-subtle">{hint}</p>}
    </>
  );

  const base = 'block rounded-panel border border-line bg-surface p-6 shadow-card';
  if (href) {
    return (
      <Link
        href={href}
        className={`${base} transition-[box-shadow,border-color] duration-150 hover:border-primary/30 hover:shadow-card-hover`}
      >
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}
