import type { Icon } from '@phosphor-icons/react';
import { Skeleton } from './skeleton';

/**
 * One number a role cares about. Real data only: while loading it shows a
 * skeleton, and a tile is simply not rendered for a role that lacks the
 * permission behind it.
 */
export function KpiTile({
  label,
  value,
  hint,
  icon: IconComponent,
  loading,
}: {
  label: string;
  value: string | number | undefined;
  hint?: string;
  icon: Icon;
  loading?: boolean;
}) {
  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-fg-muted">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-control bg-primary-subtle text-primary-subtle-fg">
          <IconComponent size={18} aria-hidden="true" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="tabular mt-2 font-mono text-[28px] font-semibold leading-8 text-fg">
          {value ?? '-'}
        </p>
      )}
      {hint && <p className="mt-1 text-[13px] text-fg-subtle">{hint}</p>}
    </div>
  );
}
