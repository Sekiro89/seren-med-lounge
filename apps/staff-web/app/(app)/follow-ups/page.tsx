'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowFatLineUp,
  CalendarCheck,
  FirstAidKit,
  Heartbeat,
  Phone,
  Pill,
  Plus,
  WarningCircle,
  ChatCircleText,
  type Icon,
} from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { PersonCell } from '../../../components/ui/avatar';
import { StatusBadge } from '../../../components/ui/badge';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Tabs } from '../../../components/ui/tabs';
import { formatDate, formatTime, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { NewFollowUpDialog, RowActionDialog, type RowAction } from './_components/dialogs';
import type { DoctorOption, FollowUpRow } from './_components/helpers';

type TabKey = 'today' | 'overdue' | 'escalated' | 'mine';

const TYPE_ICONS: Record<string, Icon> = {
  REVIEW_APPOINTMENT: CalendarCheck,
  MEDICATION_REMINDER: Pill,
  RECOVERY_CHECK: Heartbeat,
  REPORT_ALERT: WarningCircle,
  OTHER: ChatCircleText,
};

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  today: {
    title: 'Nothing due today',
    description: 'Follow-ups due today appear here. Create one for a patient who needs a check-in.',
  },
  overdue: {
    title: 'Nothing is overdue',
    description: 'Follow-ups that passed their due date without being closed appear here.',
  },
  escalated: {
    title: 'No escalated follow-ups',
    description: 'A check-in that found a problem is escalated to a doctor and listed here.',
  },
  mine: {
    title: 'Nothing is assigned to you',
    description: 'Open follow-ups assigned to you appear here.',
  },
};

const isOpen = (row: FollowUpRow) => row.status === 'PENDING' || row.status === 'ESCALATED';

export default function FollowUpsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'follow-up:manage');
  const [tab, setTab] = useState<TabKey>('today');
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [acting, setActing] = useState<{ action: RowAction; row: FollowUpRow }>();

  const today = useApi<FollowUpRow[]>(allowed ? '/follow-ups?view=today' : null);
  const overdue = useApi<FollowUpRow[]>(allowed ? '/follow-ups?view=overdue' : null);
  const escalated = useApi<FollowUpRow[]>(allowed ? '/follow-ups?status=ESCALATED' : null);
  const mine = useApi<FollowUpRow[]>(allowed ? '/follow-ups?mine=true' : null);

  const directory = useApi<{ id: string; fullName: string; role: string }[]>(
    allowed ? '/users/directory' : null,
  );
  const doctors = useMemo<DoctorOption[]>(() => {
    const all = directory.data ?? [];
    const isDoctor = (r: string) => r.endsWith('_DOCTOR');
    const label = (u: { fullName: string; role: string }) => `${u.fullName} (${humanize(u.role)})`;
    return [...all.filter((u) => isDoctor(u.role)), ...all.filter((u) => !isDoctor(u.role))].map(
      (u) => ({ id: u.id, fullName: label(u) }),
    );
  }, [directory.data]);

  const sources: Record<TabKey, typeof today> = { today, overdue, escalated, mine };
  const active = sources[tab];
  const rows = useMemo(
    () => (tab === 'mine' ? (active.data ?? []).filter(isOpen) : active.data),
    [tab, active.data],
  );

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const reloadAll = () => {
    today.reload();
    overdue.reload();
    escalated.reload();
    mine.reload();
  };

  const columns: Column<FollowUpRow>[] = [
    {
      header: 'Patient',
      render: (r) => (
        <div>
          <PersonCell name={fullName(r.patient)} />
          <a
            href={`tel:${r.patient.phone}`}
            className="tabular mt-1 ml-11 inline-flex items-center gap-1 text-xs text-primary-subtle-fg hover:underline"
          >
            <Phone size={12} aria-hidden="true" />
            {r.patient.phone}
          </a>
        </div>
      ),
    },
    {
      header: 'Type',
      render: (r) => {
        const TypeIcon = TYPE_ICONS[r.type] ?? ChatCircleText;
        return (
          <span className="inline-flex items-center gap-2">
            <TypeIcon size={18} aria-hidden="true" className="text-fg-muted" />
            {humanize(r.type)}
          </span>
        );
      },
    },
    {
      header: 'Due',
      render: (r) => {
        const late = isOpen(r) && new Date(r.dueAt).getTime() < now;
        return (
          <span className={`tabular ${late ? 'font-medium text-danger-fg' : ''}`}>
            {formatDate(r.dueAt)} {formatTime(r.dueAt)}
            {late && <span className="ml-1.5 text-xs">Overdue</span>}
          </span>
        );
      },
    },
    {
      header: 'Assignee',
      render: (r) => r.assignedTo?.fullName ?? <span className="text-fg-subtle">Unassigned</span>,
    },
    { header: 'Status', render: (r) => <StatusBadge domain="followUp" status={r.status} /> },
    {
      header: 'Actions',
      render: (r) => (
        <div className="flex flex-wrap gap-1.5 py-1">
          {isOpen(r) && (
            <Button size="sm" onClick={() => setActing({ action: 'done', row: r })}>
              Mark done
            </Button>
          )}
          {r.status === 'PENDING' && (
            <>
              {r.type === 'REVIEW_APPOINTMENT' && !r.appointmentId && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setActing({ action: 'book', row: r })}
                >
                  Book review
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={<ArrowFatLineUp size={16} aria-hidden="true" />}
                onClick={() => setActing({ action: 'escalate', row: r })}
              >
                Escalate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActing({ action: 'missed', row: r })}
              >
                Missed
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const count = (state: typeof today, filter?: (r: FollowUpRow) => boolean) =>
    state.data ? (filter ? state.data.filter(filter) : state.data).length : undefined;

  const empty = EMPTY_COPY[tab];

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Check-ins and reviews to do for patients after treatment."
        action={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            New follow-up
          </Button>
        }
      />

      <Card>
        <div className="px-5">
          <Tabs<TabKey>
            label="Follow-up lists"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'today', label: 'Today', count: count(today) },
              { key: 'overdue', label: 'Overdue', count: count(overdue) },
              { key: 'escalated', label: 'Escalated', count: count(escalated) },
              { key: 'mine', label: 'Mine', count: count(mine, isOpen) },
            ]}
          />
        </div>

        {active.errorStatus !== undefined && !active.loading ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <FirstAidKit size={24} aria-hidden="true" className="text-fg-subtle" />
            <p className="text-sm text-fg-muted">
              {active.errorStatus === 403
                ? 'You do not have access to follow-ups.'
                : (active.errorMessage ?? 'This could not be loaded.')}
            </p>
            <Button variant="secondary" onClick={active.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            loading={active.loading}
            empty={
              <EmptyState
                icon={CalendarCheck}
                title={empty.title}
                description={empty.description}
                action={
                  <Button
                    variant="secondary"
                    icon={<Plus size={18} aria-hidden="true" />}
                    onClick={() => setCreating(true)}
                  >
                    New follow-up
                  </Button>
                }
              />
            }
          />
        )}
      </Card>

      <NewFollowUpDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={reloadAll}
        doctors={doctors}
      />
      <RowActionDialog
        action={acting?.action}
        row={acting?.row}
        doctors={doctors}
        onClose={() => setActing(undefined)}
        onSaved={reloadAll}
      />
    </>
  );
}
