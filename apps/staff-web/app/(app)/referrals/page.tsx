'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowsLeftRight, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { type Column } from '../../../components/ui/data-table';
import { Dialog } from '../../../components/ui/dialog';
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
import { RuledTable } from '../../../components/ui/ruled-table';
import { formatDate, formatTime, fullName, humanize } from '../../../lib/format';
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
    {
      header: 'Sent',
      render: (r) => (
        <span className="tabular block whitespace-nowrap font-mono leading-tight">
          {formatDate(r.createdAt)}
          <span className="block text-[12px] text-fg-muted">{formatTime(r.createdAt)}</span>
        </span>
      ),
    },
    {
      header: 'Patient',
      render: (r) => (
        <Link href={`/patients/${r.patient.id}`} className="font-medium text-fg hover:text-primary">
          {fullName(r.patient)}
        </Link>
      ),
    },
    {
      header: 'From',
      render: (r) => <span className="text-fg-muted">{r.referredBy.fullName}</span>,
    },
    {
      header: 'To',
      render: (r) => {
        const to = destination(r);
        return (
          <span className="block leading-tight">
            {to.main}
            {to.sub && <span className="block text-[12px] text-fg-muted">{to.sub}</span>}
          </span>
        );
      },
    },
    {
      header: 'Urgency',
      render: (r) => <StatusWord tone={URGENCY_TONE[r.urgency]}>{humanize(r.urgency)}</StatusWord>,
    },
    {
      header: 'Reason',
      render: (r) => (
        <button
          type="button"
          onClick={() => setReading(r)}
          aria-label={`Read the full reason for ${fullName(r.patient)}`}
          className="block max-w-[260px] cursor-pointer truncate rounded-control text-left text-fg-muted hover:text-primary"
        >
          {r.reason}
        </button>
      ),
    },
    {
      header: 'Status',
      align: 'right',
      render: (r) => (
        <div className="flex flex-wrap items-center justify-end gap-2 py-1">
          <StatusWord tone={STATUS_TONE[r.status]}>{humanize(r.status)}</StatusWord>
          {canAct && r.status === 'OPEN' && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setActing({ action: 'complete', row: r })}
              >
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

  const urgentOpen = open.data?.filter((r) => r.urgency !== 'ROUTINE').length;
  const emergencyOpen = open.data?.some((r) => r.urgency === 'EMERGENCY');

  const empty = EMPTY_COPY[tab];

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow="Clinical"
          title="Referrals"
          description="Patients sent between doctors, or on to another facility."
          figures={
            <Figures
              loading={mine.loading && !mine.data}
              items={[
                { label: 'Sent to me', value: mine.data?.length },
                { label: 'Open', value: open.data?.length },
                {
                  label: 'Urgent and open',
                  value: urgentOpen,
                  tone: urgentOpen ? (emergencyOpen ? 'danger' : 'warning') : undefined,
                },
                { label: 'Closed', value: closedRows?.length },
              ]}
            />
          }
        />
        <SheetBar>
          <InkFilters<TabKey>
            label="Referral lists"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'mine', label: 'Sent to me', count: mine.data?.length },
              { key: 'open', label: 'Open', count: open.data?.length },
              { key: 'closed', label: 'Closed', count: closedRows?.length },
            ]}
          />
        </SheetBar>

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
          <RuledTable
            columns={columns}
            rows={active.data}
            getRowKey={(r) => r.id}
            loading={active.loading}
            minWidth={980}
            isMuted={(r) => r.status === 'CANCELLED'}
            empty={
              <EmptyState
                icon={ArrowsLeftRight}
                title={empty.title}
                description={empty.description}
              />
            }
          />
        )}
      </InkSheet>

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
