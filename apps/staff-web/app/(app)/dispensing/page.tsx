'use client';

import { useState } from 'react';
import { Pill, Package } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { PersonCell } from '../../../components/ui/avatar';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Tabs } from '../../../components/ui/tabs';
import type { Tone } from '../../../lib/status';
import { apiClient } from '../../../lib/api-client';
import { formatDate, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { PrepareDialog } from './_components/prepare-dialog';
import {
  timeAgo,
  type DispensingRow,
  type DispensingStatus,
  type PendingItem,
} from './_components/types';

type TabKey = 'prepare' | 'progress' | 'completed';
type Action = 'hand-over' | 'dispatch' | 'deliver' | 'cancel';

const STATUS_TONE: Record<DispensingStatus, Tone> = {
  PREPARED: 'warning',
  OUT_FOR_DELIVERY: 'info',
  HANDED_OVER: 'success',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

const IN_PROGRESS: DispensingStatus[] = ['PREPARED', 'OUT_FOR_DELIVERY'];

const ACTION_COPY: Record<Action, { verb: string; done: string }> = {
  'hand-over': { verb: 'Hand over', done: 'handed over' },
  dispatch: { verb: 'Dispatch', done: 'dispatched' },
  deliver: { verb: 'Mark delivered', done: 'delivered' },
  cancel: { verb: 'Cancel dispensing', done: 'cancelled' },
};

function medLabel(m: DispensingRow['medication']): string {
  return `${m.name}${m.strength ? ` ${m.strength}` : ''}`;
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <div role="alert" className="flex items-center justify-between gap-4 p-6">
        <p className="text-sm text-danger-fg">The dispensing list could not be loaded.</p>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Card>
  );
}

/**
 * Pharmacy desk: prescription lines waiting to be prepared, work in
 * progress, and what has been completed. The pending list refreshes
 * every 30 seconds.
 */
export default function DispensingPage() {
  const user = useStaff();
  const allowed = can(user.role, 'pharmacy:dispense');
  const pending = useApi<PendingItem[]>(allowed ? '/pharmacy/pending' : null, 30_000);
  const dispensings = useApi<DispensingRow[]>(allowed ? '/dispensings' : null, 30_000);

  const [tab, setTab] = useState<TabKey>('prepare');
  const [preparing, setPreparing] = useState<PendingItem | null>(null);
  const [confirm, setConfirm] = useState<{ row: DispensingRow; action: Action }>();
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const patientOf = (row: DispensingRow) => fullName(row.patient);

  const reloadAll = () => {
    pending.reload();
    dispensings.reload();
  };

  const run = async (row: DispensingRow, action: Action) => {
    setBusyId(row.id);
    setError(undefined);
    try {
      await apiClient.post(`/dispensings/${row.id}/${action}`);
      setNotice(`${medLabel(row.medication)} ${ACTION_COPY[action].done}.`);
      setConfirm(undefined);
    } catch (e) {
      setConfirm(undefined);
      setError(
        e instanceof ApiError && e.status === 409
          ? 'This dispensing has already moved on. The list has been refreshed.'
          : 'That did not go through. Please try again.',
      );
    } finally {
      setBusyId(undefined);
      reloadAll();
    }
  };

  const request = (row: DispensingRow, action: Action) => {
    // Dispatch only changes where the medicine is; the rest confirm first.
    if (action === 'dispatch') void run(row, action);
    else setConfirm({ row, action });
  };

  const all = dispensings.data ?? [];
  const inProgress = all.filter((d) => IN_PROGRESS.includes(d.status));
  const completed = all.filter((d) => !IN_PROGRESS.includes(d.status));

  const pendingColumns: Column<PendingItem>[] = [
    {
      header: 'Patient',
      render: (r) => <PersonCell name={fullName(r.prescription.patient)} />,
    },
    {
      header: 'Medicine',
      render: (r) => <span className="font-medium">{r.medicationName}</span>,
    },
    { header: 'Dosage', render: (r) => r.dosage },
    { header: 'Frequency', render: (r) => r.frequency },
    {
      header: 'Duration',
      render: (r) => (r.durationDays ? `${r.durationDays} days` : 'Not set'),
    },
    {
      header: 'Issued',
      render: (r) => (
        <span className="font-mono text-fg-muted">{timeAgo(r.prescription.createdAt)}</span>
      ),
    },
    {
      header: 'Action',
      render: (r) => (
        <Button size="sm" onClick={() => setPreparing(r)}>
          Prepare
        </Button>
      ),
    },
  ];

  const baseColumns: Column<DispensingRow>[] = [
    { header: 'Patient', render: (r) => <PersonCell name={patientOf(r)} /> },
    {
      header: 'Medicine',
      render: (r) => (
        <span className="leading-tight">
          <span className="block font-medium">{medLabel(r.medication)}</span>
          <span className="block text-xs text-fg-subtle">
            {r.quantity} {r.medication.unit}
          </span>
        </span>
      ),
    },
    {
      header: 'Method',
      render: (r) => (
        <span className="leading-tight">
          <span className="block">{r.mode === 'PICKUP' ? 'Pickup' : 'Home delivery'}</span>
          {r.deliveryAddress && (
            <span className="block max-w-56 truncate text-xs text-fg-subtle">
              {r.deliveryAddress}
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Status',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{humanize(r.status)}</Badge>,
    },
    {
      header: 'Prepared',
      render: (r) => <span className="text-fg-muted">{formatDate(r.createdAt)}</span>,
    },
  ];

  const progressColumns: Column<DispensingRow>[] = [
    ...baseColumns,
    {
      header: 'Action',
      render: (r) => {
        const loading = busyId === r.id;
        return (
          <span className="flex flex-wrap gap-2">
            {r.status === 'PREPARED' && r.mode === 'PICKUP' && (
              <Button size="sm" loading={loading} onClick={() => request(r, 'hand-over')}>
                Hand over
              </Button>
            )}
            {r.status === 'PREPARED' && r.mode === 'HOME_DELIVERY' && (
              <Button size="sm" loading={loading} onClick={() => request(r, 'dispatch')}>
                Dispatch
              </Button>
            )}
            {r.status === 'OUT_FOR_DELIVERY' && (
              <Button size="sm" loading={loading} onClick={() => request(r, 'deliver')}>
                Mark delivered
              </Button>
            )}
            {r.status === 'PREPARED' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => request(r, 'cancel')}
              >
                Cancel
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  const listLoading = dispensings.loading;
  const failed = (tab === 'prepare' ? pending.errorStatus : dispensings.errorStatus) !== undefined;

  return (
    <>
      <PageHeader
        title="Dispensing"
        description="Prepare prescribed medicines, then hand them over or send them out."
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {error}
        </p>
      )}
      {notice && !error && (
        <p
          role="status"
          className="mb-4 rounded-control bg-success-bg px-3 py-2 text-sm text-success-fg"
        >
          {notice}
        </p>
      )}

      <Card>
        <div className="px-6">
          <Tabs
            label="Dispensing stages"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'prepare', label: 'To prepare', count: pending.data?.length },
              {
                key: 'progress',
                label: 'In progress',
                count: dispensings.data ? inProgress.length : undefined,
              },
              { key: 'completed', label: 'Completed' },
            ]}
          />
        </div>

        {failed ? (
          <div className="p-4">
            <ErrorPanel onRetry={reloadAll} />
          </div>
        ) : tab === 'prepare' ? (
          <DataTable
            columns={pendingColumns}
            rows={pending.data}
            getRowKey={(r) => r.id}
            loading={pending.loading}
            empty={
              <EmptyState
                icon={Pill}
                title="Nothing waiting to be prepared"
                description="Prescribed medicines appear here as soon as a doctor issues a prescription."
              />
            }
          />
        ) : tab === 'progress' ? (
          <DataTable
            columns={progressColumns}
            rows={dispensings.data ? inProgress : undefined}
            getRowKey={(r) => r.id}
            loading={listLoading}
            empty={
              <EmptyState
                icon={Package}
                title="No work in progress"
                description="Prepare a prescribed medicine from the To prepare tab to start one."
                action={<Button onClick={() => setTab('prepare')}>Open to prepare</Button>}
              />
            }
          />
        ) : (
          <DataTable
            columns={baseColumns}
            rows={dispensings.data ? completed : undefined}
            getRowKey={(r) => r.id}
            loading={listLoading}
            empty={
              <EmptyState
                icon={Package}
                title="Nothing completed yet"
                description="Handed over, delivered and cancelled dispensings are listed here."
              />
            }
          />
        )}
      </Card>

      <PrepareDialog
        item={preparing}
        onClose={() => setPreparing(null)}
        onDone={() => {
          setNotice(undefined);
          reloadAll();
        }}
      />

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(undefined)}
        title={confirm ? ACTION_COPY[confirm.action].verb : 'Confirm'}
        footer={
          confirm && (
            <>
              <Button variant="secondary" onClick={() => setConfirm(undefined)}>
                Keep as is
              </Button>
              <Button
                variant={confirm.action === 'cancel' ? 'danger' : 'primary'}
                loading={busyId === confirm.row.id}
                onClick={() => run(confirm.row, confirm.action)}
              >
                {ACTION_COPY[confirm.action].verb}
              </Button>
            </>
          )
        }
      >
        {confirm && (
          <p className="text-sm text-fg">
            {confirm.action === 'cancel'
              ? `Cancel ${medLabel(confirm.row.medication)} for ${patientOf(confirm.row)}? The ${confirm.row.quantity} ${confirm.row.medication.unit} go back to the batches they were taken from, and the prescription line returns to the To prepare list.`
              : `${ACTION_COPY[confirm.action].verb}: ${medLabel(confirm.row.medication)} for ${patientOf(confirm.row)}.`}
          </p>
        )}
      </Dialog>
    </>
  );
}
