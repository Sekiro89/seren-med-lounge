'use client';

import { useState } from 'react';
import { Flask, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { PersonCell } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { Tabs } from '../../../components/ui/tabs';
import { formatDate, formatTime, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { CancelOrderDialog, EnterResultDialog, describeResult } from './_components/dialogs';
import type { LabItemRow, LabOrderRow } from './_components/types';

type TabKey = 'awaiting' | 'completed' | 'cancelled';

const PATHS: Record<TabKey, string> = {
  awaiting: '/lab-orders?status=ORDERED&pending=true',
  completed: '/lab-orders?status=ORDERED',
  cancelled: '/lab-orders?status=CANCELLED',
};

const isComplete = (o: LabOrderRow) => o.items.every((i) => i.results.length > 0);

function OrderBlock({
  order,
  canEnter,
  canCancel,
  onEnter,
  onCancel,
}: {
  order: LabOrderRow;
  canEnter: boolean;
  canCancel: boolean;
  onEnter: (item: LabItemRow, order: LabOrderRow) => void;
  onCancel: (order: LabOrderRow) => void;
}) {
  const cancellable =
    canCancel && order.status !== 'CANCELLED' && order.items.every((i) => i.results.length === 0);
  const name = fullName(order.patient);
  return (
    <li className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <PersonCell name={name} />
          <p className="pl-11 text-[13px] text-fg-subtle">
            Ordered by {order.author.fullName} on{' '}
            <span className="tabular font-mono">
              {formatDate(order.createdAt)} {formatTime(order.createdAt)}
            </span>
          </p>
        </div>
        {cancellable && (
          <Button variant="ghost" size="sm" onClick={() => onCancel(order)}>
            Cancel order
          </Button>
        )}
      </div>
      <ul className="mt-5 divide-y divide-line pl-11">
        {order.items.map((item) => {
          const current = item.results[0];
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{item.testName}</p>
                {item.instructions && (
                  <p className="mt-0.5 text-[13px] text-fg-subtle">{item.instructions}</p>
                )}
              </div>
              <div className="flex items-center gap-4">
                {current ? (
                  <div className="text-right">
                    <p className="tabular font-mono text-sm font-medium text-fg">
                      {describeResult(current)}
                    </p>
                    <p className="text-[13px] text-fg-subtle">
                      {current.referenceRange ? `Reference ${current.referenceRange}` : 'No range'}
                      {item.results.length > 1 ? ', corrected' : ''}
                    </p>
                  </div>
                ) : (
                  <Badge tone="warning">Awaiting result</Badge>
                )}
                {canEnter && order.status !== 'CANCELLED' && (
                  <Button variant="secondary" size="sm" onClick={() => onEnter(item, order)}>
                    {current ? 'Correct result' : 'Enter result'}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
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

  return (
    <>
      <PageHeader
        title="Labs"
        description="Tests ordered for patients and the results entered for them."
      />
      <Card>
        <div className="px-6">
          <Tabs<TabKey>
            label="Lab orders"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'awaiting', label: 'Awaiting results', count: awaiting.data?.length },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>

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
          <div className="flex flex-col gap-8 px-6 py-6" aria-busy="true">
            {[0, 1, 2].map((n) => (
              <div key={n} className="flex flex-col gap-4">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="ml-11 h-10" />
                <Skeleton className="ml-11 h-10" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Flask} title={empty[tab].title} description={empty[tab].description} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((order) => (
              <OrderBlock
                key={order.id}
                order={order}
                canEnter={canEnter}
                canCancel={canCancel}
                onEnter={(item, o) => setEntering({ item, order: o })}
                onCancel={setCancelling}
              />
            ))}
          </ul>
        )}
      </Card>

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
