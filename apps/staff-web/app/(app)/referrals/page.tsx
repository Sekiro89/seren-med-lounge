'use client';

import { useMemo, useState } from 'react';
import { ArrowsLeftRight, WarningCircle } from '@phosphor-icons/react';
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
import { formatDate, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { CloseReferralDialog } from './_components/referral-dialogs';
import { destination, STATUS_TONE, URGENCY_TONE, type ReferralRow } from './_components/types';

type TabKey = 'mine' | 'open' | 'closed';

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  mine: {
    title: 'No referrals are addressed to you',
    description: 'When a colleague refers a patient to you, it appears here.',
  },
  open: {
    title: 'No open referrals',
    description: 'Referrals that have been sent and not yet closed appear here.',
  },
  closed: {
    title: 'No closed referrals',
    description: 'Completed and cancelled referrals appear here.',
  },
};

export default function ReferralsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'patient-record:read-clinical');
  const canAct = can(user.role, 'referral:write');
  const [tab, setTab] = useState<TabKey>('mine');
  const [reading, setReading] = useState<ReferralRow>();
  const [acting, setActing] = useState<{ action: 'complete' | 'cancel'; row: ReferralRow }>();

  const mine = useApi<ReferralRow[]>(allowed ? '/referrals?mine=true' : null);
  const open = useApi<ReferralRow[]>(allowed ? '/referrals?status=OPEN' : null);
  const completed = useApi<ReferralRow[]>(allowed ? '/referrals?status=COMPLETED' : null);
  const cancelled = useApi<ReferralRow[]>(allowed ? '/referrals?status=CANCELLED' : null);

  const closedRows = useMemo(
    () =>
      completed.data && cancelled.data
        ? [...completed.data, ...cancelled.data].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
        : undefined,
    [completed.data, cancelled.data],
  );

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const active =
    tab === 'mine'
      ? mine
      : tab === 'open'
        ? open
        : {
            data: closedRows,
            loading: completed.loading || cancelled.loading,
            errorStatus: completed.errorStatus ?? cancelled.errorStatus,
            errorMessage: completed.errorMessage ?? cancelled.errorMessage,
            reload: () => {
              completed.reload();
              cancelled.reload();
            },
          };

  const reloadAll = () => {
    mine.reload();
    open.reload();
    completed.reload();
    cancelled.reload();
  };

  const columns: Column<ReferralRow>[] = [
    { header: 'Patient', render: (r) => <PersonCell name={fullName(r.patient)} /> },
    {
      header: 'From',
      render: (r) => (
        <span>
          {r.referredBy.fullName}
          <span className="tabular font-mono block text-xs text-fg-subtle">
            {formatDate(r.createdAt)}
          </span>
        </span>
      ),
    },
    {
      header: 'To',
      render: (r) => {
        const to = destination(r);
        return (
          <span>
            {to.main}
            {to.sub && <span className="block text-xs text-fg-subtle">{to.sub}</span>}
          </span>
        );
      },
    },
    {
      header: 'Urgency',
      render: (r) => <Badge tone={URGENCY_TONE[r.urgency]}>{humanize(r.urgency)}</Badge>,
    },
    {
      header: 'Reason',
      render: (r) => (
        <button
          type="button"
          onClick={() => setReading(r)}
          aria-label={`Read the full reason for ${fullName(r.patient)}`}
          className="block max-w-[240px] cursor-pointer truncate rounded-control text-left text-fg-muted hover:text-primary"
        >
          {r.reason}
        </button>
      ),
    },
    {
      header: 'Status',
      render: (r) => (
        <div className="flex flex-wrap items-center gap-2 py-1">
          <Badge tone={STATUS_TONE[r.status]}>{humanize(r.status)}</Badge>
          {canAct && r.status === 'OPEN' && (
            <>
              <Button size="sm" onClick={() => setActing({ action: 'complete', row: r })}>
                Complete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActing({ action: 'cancel', row: r })}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const empty = EMPTY_COPY[tab];

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Patients sent between doctors, or on to another facility."
      />

      <Card>
        <div className="px-6">
          <Tabs<TabKey>
            label="Referral lists"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'mine', label: 'Sent to me', count: mine.data?.length },
              { key: 'open', label: 'Open', count: open.data?.length },
              { key: 'closed', label: 'Closed', count: closedRows?.length },
            ]}
          />
        </div>

        {active.errorStatus !== undefined && !active.loading ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <WarningCircle size={24} aria-hidden="true" className="text-danger-fg" />
            <p className="text-sm text-fg-muted">
              {active.errorStatus === 403
                ? 'You do not have access to referrals.'
                : (active.errorMessage ?? 'This could not be loaded.')}
            </p>
            <Button variant="secondary" onClick={active.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={active.data}
            getRowKey={(r) => r.id}
            loading={active.loading}
            empty={
              <EmptyState
                icon={ArrowsLeftRight}
                title={empty.title}
                description={empty.description}
              />
            }
          />
        )}
      </Card>

      <Dialog
        open={Boolean(reading)}
        onClose={() => setReading(undefined)}
        variant="drawer"
        title={reading ? fullName(reading.patient) : 'Referral'}
        description={reading ? `Referred by ${reading.referredBy.fullName}` : undefined}
        footer={
          <Button variant="secondary" onClick={() => setReading(undefined)}>
            Close
          </Button>
        }
      >
        {reading && (
          <dl className="flex flex-col gap-6 text-sm">
            <div>
              <dt className="text-[13px] text-fg-subtle">Sent to</dt>
              <dd className="mt-1 text-fg">
                {destination(reading).main}
                {destination(reading).sub ? `, ${destination(reading).sub}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-fg-subtle">Reason</dt>
              <dd className="mt-1 whitespace-pre-wrap text-fg">{reading.reason}</dd>
            </div>
            {reading.outcomeNote && (
              <div>
                <dt className="text-[13px] text-fg-subtle">Outcome note</dt>
                <dd className="mt-1 whitespace-pre-wrap text-fg">{reading.outcomeNote}</dd>
              </div>
            )}
          </dl>
        )}
      </Dialog>

      {acting && (
        <CloseReferralDialog
          action={acting.action}
          row={acting.row}
          onClose={() => setActing(undefined)}
          onSaved={reloadAll}
        />
      )}
    </>
  );
}
