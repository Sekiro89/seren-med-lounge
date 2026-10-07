'use client';

import { ClockCounterClockwise, PencilSimpleLine, Package } from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { DataTable, type Column } from '../../../../components/ui/data-table';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ErrorPanel, ExpiryCell, medicineLabel, type BatchRow } from './shared';

export function BatchTable({
  rows,
  loading,
  failed,
  onRetry,
  onAdjust,
  onHistory,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  rows: BatchRow[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onAdjust: (batch: BatchRow) => void;
  onHistory: (batch: BatchRow) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  if (failed) return <ErrorPanel message="The batches could not be loaded." onRetry={onRetry} />;

  const columns: Column<BatchRow>[] = [
    {
      header: 'Medicine',
      render: (b) => <span className="font-medium">{medicineLabel(b.medication)}</span>,
    },
    {
      header: 'Batch',
      render: (b) => <span className="font-mono text-[13px]">{b.batchNumber}</span>,
    },
    { header: 'Expiry', render: (b) => <ExpiryCell iso={b.expiryDate} /> },
    {
      header: 'On hand',
      align: 'right',
      numeric: true,
      render: (b) => (
        <span>
          {b.quantityOnHand} <span className="text-fg-subtle">{b.medication.unit}</span>
        </span>
      ),
    },
    { header: 'Received', align: 'right', numeric: true, render: (b) => b.quantityReceived },
    {
      header: 'Supplier',
      render: (b) => b.supplier ?? <span className="text-fg-subtle">Not recorded</span>,
    },
    {
      header: 'Actions',
      align: 'right',
      render: (b) => (
        <span className="inline-flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            icon={<PencilSimpleLine size={16} aria-hidden="true" />}
            onClick={() => onAdjust(b)}
          >
            Adjust
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<ClockCounterClockwise size={16} aria-hidden="true" />}
            onClick={() => onHistory(b)}
          >
            History
          </Button>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(b) => b.id}
      loading={loading}
      empty={
        <EmptyState
          icon={Package}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      }
    />
  );
}
