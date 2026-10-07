import Link from 'next/link';
import type { Icon } from '@phosphor-icons/react';
import { Skeleton } from './skeleton';

export type KpiTone = 'primary' | 'info' | 'warning' | 'success' | 'danger';

// Clinical Ink figures: no icon boxes; the icon is a quiet glyph and only
// warning/danger tiles colour it.
const ICON_TONES: Record<KpiTone, string> = {
  primary: 'text-fg-subtle',
  info: 'text-fg-subtle',
  warning: 'text-warning-fg',
  success: 'text-fg-subtle',
  danger: 'text-danger-fg',
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-fg-muted">{label}</p>
        <IconComponent size={20} className={ICON_TONES[tone]} aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-9 w-24" />
      ) : (
        <p className="tabular mt-3 font-mono text-[32px] font-medium leading-10 tracking-tight text-fg">
          {value ?? '-'}
        </p>
      )}
      {hint && <p className="mt-1.5 text-[13px] text-fg-subtle">{hint}</p>}
    </>
  );

  const base = 'block rounded-panel border border-line bg-surface p-6';
  if (href) {
    return (
      <Link
        href={href}
        className={`${base} transition-colors duration-150 hover:border-primary hover:bg-surface-muted`}
      >
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}

/**
 * Put on the grid that holds a row of KpiTiles: one white sheet with the
 * figures split by hairlines (design system 14a) instead of separate boxes.
 */
export const KPI_STRIP =
  'grid border-l border-t border-line bg-surface [&>*]:border-0! [&>*]:border-r! [&>*]:border-b! [&>*]:border-line!';
