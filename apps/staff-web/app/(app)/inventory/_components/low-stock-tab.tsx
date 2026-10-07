'use client';

import { Plus, CheckCircle } from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { DataTable, type Column } from '../../../../components/ui/data-table';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ErrorPanel, medicineLabel, type LowStockRow } from './shared';

function LevelBar({ usable, reorder }: { usable: number; reorder: number }) {
  const pct = reorder <= 0 ? 0 : Math.min(100, Math.round((usable / reorder) * 100));
  const fill = usable === 0 ? 'bg-danger' : 'bg-warning-fg';
  return (
    <div
      role="img"
      aria-label={`${usable} of ${reorder} units at the reorder level`}
      className="h-2 w-28 overflow-hidden rounded-full bg-neutral-bg"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LowStockTab({
  rows,
  loading,
  failed,
  onRetry,
  onReceive,
}: {
  rows: LowStockRow[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onReceive: (medicationId: string) => void;
}) {
  if (failed) return <ErrorPanel message="Low stock could not be loaded." onRetry={onRetry} />;

  const columns: Column<LowStockRow>[] = [
    {
      header: 'Medicine',
      render: (m) => <span className="font-medium">{medicineLabel(m)}</span>,
    },
    {
      header: 'Usable on hand',
      align: 'right',
      render: (m) => (
        <span className={m.usableOnHand === 0 ? 'font-semibold text-danger-fg' : ''}>
          {m.usableOnHand} <span className="text-fg-subtle">{m.unit}</span>
        </span>
      ),
    },
    { header: 'Reorder level', align: 'right', render: (m) => m.reorderLevel ?? 0 },
    {
      header: 'Level',
      render: (m) => <LevelBar usable={m.usableOnHand} reorder={m.reorderLevel ?? 0} />,
    },
    {
      header: 'Action',
      align: 'right',
      render: (m) => (
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={16} aria-hidden="true" />}
          onClick={() => onReceive(m.id)}
        >
          Receive stock
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(m) => m.id}
      loading={loading}
      empty={
        <EmptyState
          icon={CheckCircle}
          title="Nothing is running low"
          description="Every medicine with a reorder level has enough usable stock."
        />
      }
    />
  );
}
