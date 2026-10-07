'use client';

import { useEffect, useState } from 'react';
import { Pill, Plus } from '@phosphor-icons/react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { DataTable, type Column } from '../../../../components/ui/data-table';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { SearchBox } from '../../../../components/ui/search-box';
import { Toolbar } from '../../../../components/ui/toolbar';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney, humanize } from '../../../../lib/format';
import { useApi } from '../../../../lib/use-api';
import { AddMedicineDialog } from './add-medicine-dialog';
import { ErrorPanel, FormError, serverMessage, type Medication } from './shared';

export function MedicinesTab({ version, onChanged }: { version: number; onChanged: () => void }) {
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

  const columns: Column<Medication>[] = [
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
    { header: 'Unit', render: (m) => <span className="text-fg-muted">{m.unit}</span> },
    {
      header: 'Price',
      align: 'right',
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
      render: (m) => m.reorderLevel ?? <span className="text-fg-subtle">Not set</span>,
    },
    {
      header: 'Status',
      render: (m) => (
        <Badge tone={m.isActive ? 'success' : 'neutral'}>
          {m.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Action',
      align: 'right',
      render: (m) => (
        <Button
          size="sm"
          variant="secondary"
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
      <Toolbar
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
          className="w-72"
        />
      </Toolbar>
      {errorStatus !== undefined && !data ? (
        <ErrorPanel message="The catalogue could not be loaded." onRetry={reload} />
      ) : (
        <DataTable
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
