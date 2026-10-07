'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flask, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import {
  Figures,
  InkFilters,
  InkSheet,
  SheetBar,
  SheetHead,
  StatusWord,
} from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { formatDate, formatTime, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { RangeRuler, parseRange, parseValue, rangeFlag } from '../encounters/[id]/document';
import { CancelOrderDialog, EnterResultDialog, describeResult } from './_components/dialogs';
import type { LabItemRow, LabOrderRow } from './_components/types';

type TabKey = 'awaiting' | 'completed' | 'cancelled';

const PATHS: Record<TabKey, string> = {
  awaiting: '/lab-orders?status=ORDERED&pending=true',
  completed: '/lab-orders?status=ORDERED',
  cancelled: '/lab-orders?status=CANCELLED',
};

const isComplete = (o: LabOrderRow) => o.items.every((i) => i.results.length > 0);

/** "35 min", "3 h", "2 d": how long an order has been open. */
function ageText(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

const FLAG_WORD = { HIGH: 'High', LOW: 'Low', NORMAL: 'Normal' } as const;

function OrderBlock({
  order,
  now,
  canEnter,
  canCancel,
  onEnter,
  onCancel,
}: {
  order: LabOrderRow;
  now: number;
  canEnter: boolean;
  canCancel: boolean;
  onEnter: (item: LabItemRow, order: LabOrderRow) => void;
  onCancel: (order: LabOrderRow) => void;
}) {
  const cancellable =
    canCancel && order.status !== 'CANCELLED' && order.items.every((i) => i.results.length === 0);
  const name = fullName(order.patient);
  const done = order.items.filter((i) => i.results.length > 0).length;
  return (
    <li className="grid gap-x-8 gap-y-2 border-b border-line px-5 py-5 last:border-b-0 sm:px-8 lg:grid-cols-[168px_minmax(0,1fr)]">
      {/* The margin: when, who, how long. */}
      <div className="text-[12px] leading-[1.5] text-fg-muted lg:text-right">
        <p className="tabular font-mono text-[13px] text-fg">
          {formatDate(order.createdAt)} {formatTime(order.createdAt)}
        </p>
        <p>Ordered by {order.author.fullName}</p>
        {order.status !== 'CANCELLED' && done < order.items.length && (
          <p>
            Open for{' '}
            <span className="tabular font-mono text-fg">{ageText(order.createdAt, now)}</span>
          </p>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h3 className="text-[15px] font-semibold text-fg">
            <Link href={`/patients/${order.patient.id}`} className="hover:text-primary">
              {name}
            </Link>
          </h3>
          <span className="tabular font-mono text-[12px] text-fg-muted">
            {done} of {order.items.length} {order.items.length === 1 ? 'result' : 'results'}
          </span>
          {order.status === 'CANCELLED' && <StatusWord tone="danger">Cancelled</StatusWord>}
          {cancellable && (
            <button
              type="button"
              onClick={() => onCancel(order)}
              className="ml-auto cursor-pointer text-[13px] font-medium text-fg-muted hover:text-danger-fg"
            >
              Cancel order
            </button>
          )}
        </div>
        <ul className="mt-2 border-t border-fg">
          {order.items.map((item) => {
            const current = item.results[0];
            const range = current ? parseRange(current.referenceRange) : undefined;
            const value = current ? parseValue(current.resultValue) : undefined;
            const flag = range && value !== undefined ? rangeFlag(value, range) : undefined;
            const out = flag === 'HIGH' || flag === 'LOW';
            return (
              <li
                key={item.id}
                className="grid items-center gap-x-6 gap-y-2 border-b border-line py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_150px_minmax(140px,200px)_150px]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{item.testName}</p>
                  {item.instructions && (
                    <p className="mt-0.5 text-[12px] text-fg-muted">{item.instructions}</p>
                  )}
                </div>
                {current ? (
                  <>
                    <p className="flex items-baseline justify-end gap-2 md:text-right">
                      <span
                        className={`tabular font-mono text-[15px] font-medium ${out ? 'text-warning-fg' : 'text-fg'}`}
                      >
                        {describeResult(current)}
                      </span>
                      {flag && (
                        <span
                          className={`text-[11px] font-semibold ${out ? 'text-warning-fg' : 'text-success-fg'}`}
                        >
                          {FLAG_WORD[flag]}
                        </span>
                      )}
                    </p>
                    <div className="min-w-0">
                      {range && value !== undefined && <RangeRuler value={value} range={range} />}
                      <p className="mt-0.5 text-[11px] text-fg-muted">
                        {current.referenceRange ? `normal ${current.referenceRange}` : 'No range'}
                        {item.results.length > 1 ? ' · corrected' : ''}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="md:text-right">
                      <StatusWord tone="warning">Awaiting result</StatusWord>
                    </p>
                    <span />
                  </>
                )}
                <div className="md:text-right">
                  {canEnter && order.status !== 'CANCELLED' && (
                    <Button
                      variant={current ? 'ghost' : 'secondary'}
                      size="sm"
                      onClick={() => onEnter(item, order)}
                    >
                      {current ? 'Correct result' : 'Enter result'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

export default function LabsPage() {
  const user = useStaff();
  const canEnter = can(user.role, 'lab-result:write');
  const canCancel = can(user.role, 'lab-order:write');
  const allowed = can(user.role, 'patient-record:read-clinical') && (canEnter || canCancel);

  const [tab, setTab] = useState<TabKey>('awaiting');
  const [entering, setEntering] = useState<{ item: LabItemRow; order: LabOrderRow }>();
  const [cancelling, setCancelling] = useState<LabOrderRow>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const awaiting = useApi<LabOrderRow[]>(allowed ? PATHS.awaiting : null, 30_000);
  const completed = useApi<LabOrderRow[]>(allowed && tab === 'completed' ? PATHS.completed : null);
  const cancelled = useApi<LabOrderRow[]>(allowed && tab === 'cancelled' ? PATHS.cancelled : null);
  const states = { awaiting, completed, cancelled };
  const active = states[tab];

  const rows = tab === 'completed' ? (active.data ?? []).filter(isComplete) : (active.data ?? []);

  const reloadAll = () => {
    awaiting.reload();
    if (tab === 'completed') completed.reload();
    if (tab === 'cancelled') cancelled.reload();
  };

  if (!allowed) {
    return (
      <>
        <PageHeader title="Labs" />
        <Card>
          <NoAccess homeHref={homeFor(user.role)} />
        </Card>
      </>
    );
  }

  const orderingNote = canEnter ? undefined : ' Tests are ordered from the consultation workspace.';
  const empty: Record<TabKey, { title: string; description: string }> = {
    awaiting: {
      title: 'No tests are waiting for a result',
      description: `New orders from consultations appear here.${orderingNote ?? ''}`,
    },
    completed: {
      title: 'No completed orders yet',
      description: `Orders appear here once every test has a result.${orderingNote ?? ''}`,
    },
    cancelled: {
      title: 'No cancelled orders',
      description: 'Orders that were cancelled before any result was entered appear here.',
    },
  };

  const waitingOrders = awaiting.data ?? [];
  const testsWaiting = waitingOrders.reduce(
    (sum, o) => sum + o.items.filter((i) => i.results.length === 0).length,
    0,
  );
  const oldest = waitingOrders.reduce<string | undefined>(
    (min, o) => (min === undefined || o.createdAt < min ? o.createdAt : min),
    undefined,
  );

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow="Lab worklist"
          title="Labs"
          description="Tests ordered for patients and the results entered for them."
          figures={
            <Figures
              loading={awaiting.loading && !awaiting.data}
              items={[
                { label: 'Orders waiting', value: waitingOrders.length },
                { label: 'Tests waiting', value: testsWaiting },
                { label: 'Oldest open order', value: oldest ? ageText(oldest, now) : 'None' },
              ]}
            />
          }
        />
        <SheetBar>
          <InkFilters<TabKey>
            label="Lab orders"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'awaiting', label: 'Awaiting results', count: awaiting.data?.length },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </SheetBar>

        {active.errorStatus !== undefined && !active.loading ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <WarningCircle size={24} aria-hidden="true" className="text-fg-subtle" />
            <p className="text-sm text-fg-muted">
              {active.errorStatus === 403
                ? 'You do not have access to lab orders.'
                : (active.errorMessage ?? 'This could not be loaded.')}
            </p>
            <Button variant="secondary" onClick={active.reload}>
              Try again
            </Button>
          </div>
        ) : active.loading || (active.data === undefined && active.errorStatus === undefined) ? (
          <div className="flex flex-col gap-8 px-5 py-6 sm:px-8" aria-busy="true">
            {[0, 1, 2].map((n) => (
              <div key={n} className="grid gap-8 lg:grid-cols-[168px_minmax(0,1fr)]">
                <Skeleton className="h-4 w-32 lg:ml-auto" />
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Flask} title={empty[tab].title} description={empty[tab].description} />
        ) : (
          <ul>
            {rows.map((order) => (
              <OrderBlock
                key={order.id}
                order={order}
                now={now}
                canEnter={canEnter}
                canCancel={canCancel}
                onEnter={(item, o) => setEntering({ item, order: o })}
                onCancel={setCancelling}
              />
            ))}
          </ul>
        )}
      </InkSheet>

      <EnterResultDialog
        item={entering?.item}
        order={entering?.order}
        onClose={() => setEntering(undefined)}
        onSaved={reloadAll}
      />
      <CancelOrderDialog
        order={cancelling}
        onClose={() => setCancelling(undefined)}
        onSaved={reloadAll}
      />
    </>
  );
}
