'use client';

import { useState } from 'react';
import { Pill, Package } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import {
  Figures,
  InkFilters,
  InkSheet,
  SheetBar,
  SheetHead,
  StatusWord,
} from '../../../components/ui/ink';
import { LedgerTable, type LedgerColumn } from '../../../components/ui/ledger-table';
import { Skeleton } from '../../../components/ui/skeleton';
import type { Tone } from '../../../lib/status';
import { apiClient } from '../../../lib/api-client';
import { formatDate, formatTime, fullName, humanize } from '../../../lib/format';
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
    <div role="alert" className="flex items-center justify-between gap-4 px-8 py-6">
      <p className="text-sm text-danger-fg">The dispensing list could not be loaded.</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
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

  const baseColumns: LedgerColumn<DispensingRow>[] = [
    { header: 'Patient', render: (r) => <span className="font-medium">{patientOf(r)}</span> },
    {
      header: 'Medicine',
      render: (r) => <span className="font-medium">{medLabel(r.medication)}</span>,
    },
    {
      header: 'Qty',
      align: 'right',
      numeric: true,
      width: 'w-[96px]',
      render: (r) => (
        <span className="whitespace-nowrap">
          {r.quantity}{' '}
          <span className="font-sans text-[12px] text-fg-subtle">{r.medication.unit}</span>
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
      width: 'w-[140px]',
      render: (r) => <StatusWord tone={STATUS_TONE[r.status]}>{humanize(r.status)}</StatusWord>,
    },
    {
      header: 'Prepared',
      numeric: true,
      width: 'w-[112px]',
      render: (r) => <span className="text-fg-muted">{formatDate(r.createdAt)}</span>,
    },
  ];

  const progressColumns: LedgerColumn<DispensingRow>[] = [
    ...baseColumns,
    {
      header: 'Action',
      align: 'right',
      render: (r) => {
        const loading = busyId === r.id;
        return (
          <span className="flex flex-wrap justify-end gap-2">
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

  const slips = groupSlips(pending.data ?? []);
  const outForDelivery = inProgress.filter((d) => d.status === 'OUT_FOR_DELIVERY').length;

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow="Pharmacy"
          title="Dispensing"
          description="Prepare prescribed medicines, then hand them over or send them out."
          figures={
            <Figures
              loading={pending.loading && !pending.data}
              items={[
                { label: 'Prescriptions waiting', value: pending.data ? slips.length : undefined },
                { label: 'Lines to prepare', value: pending.data?.length },
                {
                  label: 'Ready to hand over',
                  value: dispensings.data ? inProgress.length - outForDelivery : undefined,
                },
                {
                  label: 'Out for delivery',
                  value: dispensings.data ? outForDelivery : undefined,
                },
              ]}
            />
          }
        />

        <SheetBar>
          <InkFilters
            label="Dispensing stages"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'prepare', label: 'To prepare', count: pending.data?.length },
              {
                key: 'progress',
                label: 'In progress',
                count: dispensings.data ? inProgress.length : undefined,
              },
              {
                key: 'completed',
                label: 'Completed',
                count: dispensings.data ? completed.length : undefined,
              },
            ]}
          />
        </SheetBar>

        {error && (
          <p
            role="alert"
            className="border-b border-line bg-danger-bg px-8 py-2.5 text-sm text-danger-fg"
          >
            {error}
          </p>
        )}
        {notice && !error && (
          <p
            role="status"
            className="border-b border-line bg-success-bg px-8 py-2.5 text-sm text-success-fg"
          >
            {notice}
          </p>
        )}

        {failed ? (
          <ErrorPanel onRetry={reloadAll} />
        ) : tab === 'prepare' ? (
          pending.loading && !pending.data ? (
            <div className="space-y-3 px-8 py-6">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : slips.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="Nothing waiting to be prepared"
              description="Prescribed medicines appear here as soon as a doctor issues a prescription."
            />
          ) : (
            <div className="grid grid-cols-1 gap-x-10 gap-y-8 px-5 pb-10 pt-6 sm:px-8 xl:grid-cols-2">
              {slips.map((slip) => (
                <PrescriptionSlip key={slip.id} slip={slip} onPrepare={setPreparing} />
              ))}
            </div>
          )
        ) : tab === 'progress' ? (
          <LedgerTable
            columns={progressColumns}
            rows={dispensings.data ? inProgress : undefined}
            getRowKey={(r) => r.id}
            loading={listLoading}
            minWidth={880}
            caption="Dispensings in progress"
            empty={
              <EmptyState
                icon={Package}
                title="No work in progress"
                description="Prepare a prescribed medicine from the To prepare list to start one."
                action={<Button onClick={() => setTab('prepare')}>Open to prepare</Button>}
              />
            }
          />
        ) : (
          <LedgerTable
            columns={baseColumns}
            rows={dispensings.data ? completed : undefined}
            getRowKey={(r) => r.id}
            loading={listLoading}
            muted={(r) => r.status === 'CANCELLED'}
            minWidth={780}
            caption="Completed dispensings"
            empty={
              <EmptyState
                icon={Package}
                title="Nothing completed yet"
                description="Handed over, delivered and cancelled dispensings are listed here."
              />
            }
          />
        )}
      </InkSheet>

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

interface Slip {
  id: string;
  createdAt: string;
  patient: PendingItem['prescription']['patient'];
  lines: PendingItem[];
}

/** Pending lines grouped back into the prescriptions they came from, oldest first. */
function groupSlips(items: PendingItem[]): Slip[] {
  const map = new Map<string, Slip>();
  for (const item of items) {
    const p = item.prescription;
    const slip = map.get(p.id) ?? {
      id: p.id,
      createdAt: p.createdAt,
      patient: p.patient,
      lines: [],
    };
    slip.lines.push(item);
    map.set(p.id, slip);
  }
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * A prescription as a ruled slip: the Rx mark and the patient above an ink
 * rule, one hairline row per medicine with dosage, frequency and days in
 * Plex Mono, and Prepare on each line.
 */
function PrescriptionSlip({
  slip,
  onPrepare,
}: {
  slip: Slip;
  onPrepare: (item: PendingItem) => void;
}) {
  return (
    <article aria-label={`Prescription for ${fullName(slip.patient)}`} className="min-w-0">
      <header className="flex items-end justify-between gap-4 border-b border-fg pb-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <span
            aria-hidden="true"
            className="font-mono text-[18px] font-semibold leading-none text-fg"
          >
            Rx
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fg">{fullName(slip.patient)}</p>
            <p className="tabular font-mono text-[11px] text-fg-subtle">
              {formatDate(slip.createdAt)}, {formatTime(slip.createdAt)} · {timeAgo(slip.createdAt)}
            </p>
          </div>
        </div>
        <span className="tabular shrink-0 font-mono text-[12px] text-fg-muted">
          {slip.lines.length} line{slip.lines.length === 1 ? '' : 's'}
        </span>
      </header>
      <ol>
        {slip.lines.map((line, i) => (
          <li
            key={line.id}
            className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line py-2.5"
          >
            <span className="tabular pt-0.5 font-mono text-[11px] text-fg-subtle">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-fg">{line.medicationName}</p>
              <p className="tabular mt-0.5 font-mono text-[12px] text-fg-muted">
                {line.dosage} · {line.frequency} ·{' '}
                {line.durationDays ? `${line.durationDays} days` : 'duration not set'}
              </p>
              {line.instructions && (
                <p className="mt-0.5 text-[12px] text-fg-subtle">{line.instructions}</p>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => onPrepare(line)}>
              Prepare
            </Button>
          </li>
        ))}
      </ol>
    </article>
  );
}
