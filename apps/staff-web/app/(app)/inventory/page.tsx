'use client';

import { useState } from 'react';
import { Plus, TrendDown, Timer, Pill } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { KpiTile } from '../../../components/ui/kpi-tile';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Select } from '../../../components/ui/fields';
import { Tabs } from '../../../components/ui/tabs';
import { Toolbar } from '../../../components/ui/toolbar';
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
import type { BatchRow, LowStockRow, Medication } from './_components/shared';

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

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Medicine catalogue, batches and stock levels."
        action={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => openReceive()}>
            Receive stock
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiTile
          label="Medicines in catalogue"
          value={catalogue.data?.length}
          icon={Pill}
          loading={catalogue.loading}
        />
        <KpiTile
          label="Low stock"
          value={low.data?.length}
          hint="At or below reorder level"
          icon={TrendDown}
          tone="warning"
          loading={low.loading}
        />
        <KpiTile
          label="Expiring in 30 days"
          value={soon.data?.length}
          hint="Batches with stock, including expired"
          icon={Timer}
          tone="danger"
          loading={soon.loading}
        />
      </div>

      <Card>
        <div className="px-5">
          <Tabs
            label="Inventory views"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'medicines', label: 'Medicines' },
              { key: 'batches', label: 'Batches' },
              { key: 'low', label: 'Low stock', count: low.data?.length },
              { key: 'expiring', label: 'Expiring soon', count: soon.data?.length },
            ]}
          />
        </div>

        {tab === 'medicines' && <MedicinesTab version={version} onChanged={changed} />}

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
          <>
            <Toolbar>
              <label htmlFor="expiring-days" className="text-sm font-medium text-fg">
                Expiring within
              </label>
              <Select
                id="expiring-days"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-32"
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </Select>
            </Toolbar>
            <BatchTable
              rows={expiring.data}
              loading={expiring.loading}
              failed={expiring.errorStatus !== undefined && !expiring.data}
              onRetry={expiring.reload}
              {...batchActions}
              emptyTitle={`Nothing expires in the next ${days} days`}
              emptyDescription="Batches with stock are listed here as their expiry date approaches."
            />
          </>
        )}
      </Card>

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
