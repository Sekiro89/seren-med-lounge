'use client';

import { Plus, CheckCircle } from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { LevelRuler, StatusWord } from '../../../../components/ui/ink';
import { LedgerTable, type LedgerColumn } from '../../../../components/ui/ledger-table';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ErrorPanel, medicineLabel, type LowStockRow } from './shared';

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

  const columns: LedgerColumn<LowStockRow>[] = [
    {
      header: 'Medicine',
      render: (m) => <span className="font-medium">{medicineLabel(m)}</span>,
    },
    {
      header: 'Usable on hand',
      align: 'right',
      numeric: true,
      render: (m) => (
        <span className={m.usableOnHand === 0 ? 'font-semibold text-danger-fg' : ''}>
          {m.usableOnHand} <span className="text-fg-subtle">{m.unit}</span>
        </span>
      ),
    },
    { header: 'Reorder level', align: 'right', numeric: true, render: (m) => m.reorderLevel ?? 0 },
    {
      header: 'Level',
      width: 'w-[200px]',
      render: (m) => (
        <span
          className="flex items-center gap-3"
          role="img"
          aria-label={`${m.usableOnHand} usable against a reorder level of ${m.reorderLevel ?? 0}`}
        >
          <LevelRuler value={m.usableOnHand} reorder={m.reorderLevel} className="w-28" />
          {m.usableOnHand === 0 ? (
            <StatusWord tone="danger">Out</StatusWord>
          ) : (
            <StatusWord tone="warning">Low</StatusWord>
          )}
        </span>
      ),
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
    <LedgerTable
      caption="Medicines at or below their reorder level"
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
