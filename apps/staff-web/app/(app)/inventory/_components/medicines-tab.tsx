'use client';

import { useEffect, useState } from 'react';
import { Pill, Plus } from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { LevelRuler, SheetBar, StatusWord } from '../../../../components/ui/ink';
import { LedgerTable, type LedgerColumn } from '../../../../components/ui/ledger-table';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SearchBox } from '../../../../components/ui/search-box';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney, humanize } from '../../../../lib/format';
import { useApi } from '../../../../lib/use-api';
import { AddMedicineDialog } from './add-medicine-dialog';
import { ErrorPanel, FormError, serverMessage, type Medication } from './shared';

export function MedicinesTab({
  version,
  onChanged,
  stock,
}: {
  version: number;
  onChanged: () => void;
  /** Usable (unexpired) units on hand per medication id, from the batches; undefined while loading. */
  stock?: Map<string, number>;
}) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [addCount, setAddCount] = useState(0);
  const [target, setTarget] = useState<Medication>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(text.trim()), 300);
    return () => window.clearTimeout(id);
  }, [text]);

  const { data, loading, errorStatus, reload } = useApi<Medication[]>(
    `/medications?search=${encodeURIComponent(search)}&v=${version}`,
  );

  const openAdd = () => {
    setAddCount((n) => n + 1);
    setAdding(true);
  };

  const toggle = async () => {
    if (!target) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(
        `/medications/${target.id}/${target.isActive ? 'deactivate' : 'activate'}`,
      );
      setTarget(undefined);
      onChanged();
    } catch (e) {
      setError(serverMessage(e, 'The change was not saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const columns: LedgerColumn<Medication>[] = [
    {
      header: 'Medicine',
      render: (m) => (
        <div className="py-1">
          <p className="font-medium">{m.name}</p>
          <p className="text-[13px] text-fg-muted">
            {[m.strength, humanize(m.form)].filter(Boolean).join(', ')}
          </p>
        </div>
      ),
    },
    {
      header: 'On hand',
      align: 'right',
      numeric: true,
      width: 'w-[96px]',
      render: (m) =>
        stock === undefined ? (
          <span className="text-fg-subtle">-</span>
        ) : (
          <span
            className={
              (stock.get(m.id) ?? 0) === 0
                ? 'font-medium text-danger-fg'
                : m.reorderLevel !== null && (stock.get(m.id) ?? 0) <= m.reorderLevel
                  ? 'font-medium text-warning-fg'
                  : ''
            }
          >
            {stock.get(m.id) ?? 0}{' '}
            <span className="font-sans text-[12px] font-normal text-fg-subtle">{m.unit}</span>
          </span>
        ),
    },
    {
      header: 'Stock against reorder level',
      width: 'w-[190px]',
      render: (m) =>
        stock === undefined ? null : (
          <span
            role="img"
            aria-label={`${stock.get(m.id) ?? 0} on hand${m.reorderLevel !== null ? `, reorder at ${m.reorderLevel}` : ''}`}
            className="flex items-center gap-2"
          >
            <LevelRuler value={stock.get(m.id) ?? 0} reorder={m.reorderLevel} className="w-32" />
          </span>
        ),
    },
    {
      header: 'Price',
      align: 'right',
      numeric: true,
      render: (m) =>
        m.unitPriceMinor === null ? (
          <span className="text-fg-subtle">Not set</span>
        ) : (
          formatMoney(m.unitPriceMinor)
        ),
    },
    {
      header: 'Reorder level',
      align: 'right',
      numeric: true,
      render: (m) => m.reorderLevel ?? <span className="text-fg-subtle">Not set</span>,
    },
    {
      header: 'Status',
      render: (m) => (
        <StatusWord tone={m.isActive ? 'success' : 'neutral'}>
          {m.isActive ? 'Active' : 'Inactive'}
        </StatusWord>
      ),
    },
    {
      header: 'Action',
      align: 'right',
      render: (m) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setError(undefined);
            setTarget(m);
          }}
        >
          {m.isActive ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <SheetBar
        actions={
          <Button
            variant="secondary"
            icon={<Plus size={18} aria-hidden="true" />}
            onClick={openAdd}
          >
            Add medicine
          </Button>
        }
      >
        <SearchBox
          aria-label="Search medicines"
          placeholder="Search medicines"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-72 py-1"
        />
      </SheetBar>
      {errorStatus !== undefined && !data ? (
        <ErrorPanel message="The catalogue could not be loaded." onRetry={reload} />
      ) : (
        <LedgerTable
          minWidth={920}
          caption="Medicine catalogue"
          muted={(m) => !m.isActive}
          columns={columns}
          rows={data}
          getRowKey={(m) => m.id}
          loading={loading}
          empty={
            <EmptyState
              icon={Pill}
              title={search ? 'No medicine matches that search' : 'The catalogue is empty'}
              description={
                search
                  ? 'Check the spelling or try the generic name.'
                  : 'Add the first medicine to start tracking stock.'
              }
              action={
                search ? undefined : (
                  <Button icon={<Plus size={18} aria-hidden="true" />} onClick={openAdd}>
                    Add medicine
                  </Button>
                )
              }
            />
          }
        />
      )}
      <AddMedicineDialog
        key={addCount}
        open={adding}
        onClose={() => setAdding(false)}
        onDone={onChanged}
      />
      <Dialog
        open={target !== undefined}
        onClose={() => setTarget(undefined)}
        title={target?.isActive ? 'Deactivate medicine' : 'Activate medicine'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(undefined)}>
              Cancel
            </Button>
            <Button
              variant={target?.isActive ? 'danger' : 'primary'}
              loading={busy}
              onClick={toggle}
            >
              {target?.isActive ? 'Deactivate' : 'Activate'} {target?.name}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={error} />
          <p className="text-sm text-fg-muted">
            {target?.isActive
              ? `${target?.name} will no longer be offered for new dispensing or stock receipts. Existing batches and history stay on record.`
              : `${target?.name} will be offered again for dispensing and stock receipts.`}
          </p>
        </div>
      </Dialog>
    </>
  );
}
