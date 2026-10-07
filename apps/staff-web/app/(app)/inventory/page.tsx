'use client';

import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Figures, InkFilters, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { Select } from '../../../components/ui/fields';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { AdjustDialog } from './_components/adjust-dialog';
import { BatchTable } from './_components/batch-table';
import { LowStockTab } from './_components/low-stock-tab';
import { MedicinesTab } from './_components/medicines-tab';
import { MovementsDrawer } from './_components/movements-drawer';
import { ReceiveStockDialog } from './_components/receive-stock-dialog';
import { daysUntil, type BatchRow, type LowStockRow, type Medication } from './_components/shared';

type TabKey = 'medicines' | 'batches' | 'low' | 'expiring';

export default function InventoryPage() {
  const user = useStaff();
  const allowed = can(user.role, 'inventory:manage');

  const [tab, setTab] = useState<TabKey>('medicines');
  const [days, setDays] = useState(30);
  const [version, setVersion] = useState(0);
  const [receiving, setReceiving] = useState(false);
  const [receiveCount, setReceiveCount] = useState(0);
  const [receiveFor, setReceiveFor] = useState<string>();
  const [adjusting, setAdjusting] = useState<BatchRow>();
  const [history, setHistory] = useState<BatchRow>();

  const catalogue = useApi<Medication[]>(allowed ? `/medications?v=${version}` : null);
  const low = useApi<LowStockRow[]>(allowed ? `/stock/low?v=${version}` : null);
  const soon = useApi<BatchRow[]>(allowed ? `/stock/expiring?days=30&v=${version}` : null);
  const expiring = useApi<BatchRow[]>(
    allowed && tab === 'expiring' ? `/stock/expiring?days=${days}&v=${version}` : null,
  );
  const batches = useApi<BatchRow[]>(allowed ? `/stock/batches?v=${version}` : null);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const changed = () => setVersion((v) => v + 1);
  const openReceive = (medicationId?: string) => {
    setReceiveFor(medicationId);
    setReceiveCount((n) => n + 1);
    setReceiving(true);
  };

  const batchActions = { onAdjust: setAdjusting, onHistory: setHistory };

  // Usable (unexpired) units per medicine, summed from the batches.
  const stock = batches.data
    ? batches.data.reduce((map, b) => {
        if (daysUntil(b.expiryDate) >= 0)
          map.set(b.medication.id, (map.get(b.medication.id) ?? 0) + b.quantityOnHand);
        return map;
      }, new Map<string, number>())
    : undefined;
  const units = batches.data?.reduce((sum, b) => sum + b.quantityOnHand, 0);
  const out = low.data?.filter((m) => m.usableOnHand === 0).length;

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow="Pharmacy"
          title="Inventory"
          description="Medicine catalogue, batches and stock levels."
          figures={
            <Figures
              loading={catalogue.loading && !catalogue.data}
              items={[
                { label: 'Medicines', value: catalogue.data?.length },
                { label: 'Units on the shelves', value: units?.toLocaleString('en-IN') },
                {
                  label: 'Low stock',
                  value: low.data?.length,
                  tone: low.data?.length ? 'warning' : undefined,
                  hint: out ? `${out} out of stock` : 'At or below reorder level',
                },
                {
                  label: 'Expiring in 30 days',
                  value: soon.data?.length,
                  tone: soon.data?.length ? 'danger' : undefined,
                  hint: 'Batches, including expired',
                },
              ]}
            />
          }
          action={
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => openReceive()}>
              Receive stock
            </Button>
          }
        />

        <SheetBar>
          <InkFilters
            label="Inventory views"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'medicines', label: 'Medicines', count: catalogue.data?.length },
              { key: 'batches', label: 'Batches', count: batches.data?.length },
              { key: 'low', label: 'Low stock', count: low.data?.length },
              { key: 'expiring', label: 'Expiring soon', count: soon.data?.length },
            ]}
          />
          {tab === 'expiring' && (
            <span className="flex items-center gap-2">
              <label htmlFor="expiring-days" className="text-[13px] text-fg-muted">
                Expiring within
              </label>
              <Select
                id="expiring-days"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-8 w-28"
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </Select>
            </span>
          )}
        </SheetBar>

        {tab === 'medicines' && (
          <MedicinesTab version={version} onChanged={changed} stock={stock} />
        )}

        {tab === 'batches' && (
          <BatchTable
            rows={batches.data}
            loading={batches.loading}
            failed={batches.errorStatus !== undefined && !batches.data}
            onRetry={batches.reload}
            {...batchActions}
            emptyTitle="No stock on the shelves"
            emptyDescription="Receive a delivery to create the first batch."
            emptyAction={
              <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => openReceive()}>
                Receive stock
              </Button>
            }
          />
        )}

        {tab === 'low' && (
          <LowStockTab
            rows={low.data}
            loading={low.loading}
            failed={low.errorStatus !== undefined && !low.data}
            onRetry={low.reload}
            onReceive={openReceive}
          />
        )}

        {tab === 'expiring' && (
          <BatchTable
            rows={expiring.data}
            loading={expiring.loading}
            failed={expiring.errorStatus !== undefined && !expiring.data}
            onRetry={expiring.reload}
            {...batchActions}
            emptyTitle={`Nothing expires in the next ${days} days`}
            emptyDescription="Batches with stock are listed here as their expiry date approaches."
          />
        )}

        <p className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-[11px] text-fg-muted sm:px-8">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[5px] w-4 bg-fg" /> On hand
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[5px] w-4 bg-warning-fg" /> At or below reorder
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[7px] w-4"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, transparent 0 3px, var(--line) 3px 4px)',
              }}
            />{' '}
            Reorder zone, or the first 30 days before expiry
          </span>
        </p>
      </InkSheet>

      <ReceiveStockDialog
        key={receiveCount}
        open={receiving}
        medications={catalogue.data ?? []}
        initialMedicationId={receiveFor}
        onClose={() => setReceiving(false)}
        onDone={changed}
      />
      <AdjustDialog
        key={adjusting?.id}
        batch={adjusting}
        onClose={() => setAdjusting(undefined)}
        onDone={changed}
      />
      <MovementsDrawer batch={history} version={version} onClose={() => setHistory(undefined)} />
    </>
  );
}
