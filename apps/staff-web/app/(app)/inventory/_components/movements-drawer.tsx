'use client';

import { ClockCounterClockwise } from '@phosphor-icons/react';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Skeleton } from '../../../../components/ui/skeleton';
import { formatDate, formatTime, humanize } from '../../../../lib/format';
import { useApi } from '../../../../lib/use-api';
import { ErrorPanel, medicineLabel, type BatchRow, type MovementRow } from './shared';

export function MovementsDrawer({
  batch,
  version,
  onClose,
}: {
  batch: BatchRow | undefined;
  /** Bumped by the page after a mutation so history is re-read. */
  version: number;
  onClose: () => void;
}) {
  const { data, loading, errorStatus, reload } = useApi<MovementRow[]>(
    batch ? `/stock/movements?batchId=${encodeURIComponent(batch.id)}&v=${version}` : null,
  );

  return (
    <Dialog
      open={batch !== undefined}
      onClose={onClose}
      variant="drawer"
      title="Movement history"
      description={
        batch ? `${medicineLabel(batch.medication)}, batch ${batch.batchNumber}` : undefined
      }
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : errorStatus !== undefined ? (
        <ErrorPanel message="The history could not be loaded." onRetry={reload} />
      ) : data && data.length === 0 ? (
        <EmptyState icon={ClockCounterClockwise} title="No movements yet" />
      ) : (
        <ul className="divide-y divide-line">
          {data?.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-fg">{humanize(m.type)}</p>
                {m.reason && <p className="text-[13px] text-fg-muted">{m.reason}</p>}
                <p className="text-xs text-fg-subtle">
                  {formatDate(m.createdAt)}, {formatTime(m.createdAt)}
                </p>
              </div>
              <span
                className={`tabular rounded-full px-2 py-0.5 font-mono text-sm font-semibold ${
                  m.quantityDelta >= 0
                    ? 'bg-success-bg text-success-fg'
                    : 'bg-danger-bg text-danger-fg'
                }`}
              >
                {m.quantityDelta >= 0 ? '+' : '-'}
                {Math.abs(m.quantityDelta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
