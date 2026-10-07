'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Scissors, Plus, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { Figures, InkFilters, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { RuledTable } from '../../../components/ui/ruled-table';
import { formatDate, formatMoney, formatTime, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { STATUS_TONE, type ProcedureRow, type ProcedureStatus } from './_components/helpers';
import { PlanProcedureDialog } from './_components/plan-dialog';

type TabKey = 'PLANNED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';

const TAB_LABEL: Record<TabKey, string> = {
  PLANNED: 'Planned',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  PLANNED: {
    title: 'Nothing is waiting to be scheduled',
    description: 'A procedure that has been planned but has no date yet appears here.',
  },
  SCHEDULED: {
    title: 'Nothing is scheduled',
    description: 'Procedures with a date and doctor appear here until they start.',
  },
  IN_PROGRESS: {
    title: 'No procedure is under way',
    description: 'A procedure that has started and not yet been completed appears here.',
  },
  COMPLETED: {
    title: 'No completed procedures yet',
    description: 'Finished procedures appear here.',
  },
};

export default function ProceduresPage() {
  const user = useStaff();
  const allowed = can(user.role, 'procedure:manage');
  const [tab, setTab] = useState<TabKey>('PLANNED');
  const [planning, setPlanning] = useState(false);
  const router = useRouter();
  const canPlan = can(user.role, 'appointment:read');
  const list = useApi<ProcedureRow[]>(allowed ? '/procedures' : null);

  const counts = useMemo(() => {
    const result: Record<ProcedureStatus, number> = {
      PLANNED: 0,
      SCHEDULED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const row of list.data ?? []) result[row.status] += 1;
    return result;
  }, [list.data]);
  const rows = useMemo(
    () => (list.data ?? []).filter((row) => row.status === tab),
    [list.data, tab],
  );

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const gateOpen = (r: ProcedureRow) =>
    Boolean(r.consentDocumentId) && r.checklist.every((c) => c.completedAt);
  const notReady = (list.data ?? []).filter(
    (r) => (r.status === 'PLANNED' || r.status === 'SCHEDULED') && !gateOpen(r),
  ).length;

  const columns: Column<ProcedureRow>[] = [
    {
      header: 'Procedure',
      render: (r) => (
        <Link href={`/procedures/${r.id}`} className="block min-w-0 hover:text-primary">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{r.name}</span>
            {r.kind === 'SURGERY' && <Badge tone="info">Surgery</Badge>}
          </span>
          <span className="block truncate text-[12px] text-fg-muted">{fullName(r.patient)}</span>
        </Link>
      ),
    },
    {
      header: 'Scheduled',
      render: (r) =>
        r.scheduledAt ? (
          <span className="tabular font-mono">
            {formatDate(r.scheduledAt)}{' '}
            <span className="text-fg-muted">{formatTime(r.scheduledAt)}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">Not scheduled</span>
        ),
    },
    {
      header: 'Doctor',
      render: (r) =>
        r.performedBy?.fullName ?? <span className="text-fg-subtle">Not assigned</span>,
    },
    {
      header: 'Ready',
      render: (r) => {
        const done =
          r.checklist.filter((c) => c.completedAt).length + (r.consentDocumentId ? 1 : 0);
        const total = r.checklist.length + 1;
        const finished = r.status === 'COMPLETED' || r.status === 'IN_PROGRESS';
        return (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="flex gap-[3px]">
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className={`block size-[7px] ${
                    i < done || finished ? 'bg-fg' : 'border border-fg-subtle bg-surface'
                  }`}
                />
              ))}
            </span>
            <span
              className={`tabular font-mono text-[12px] ${
                done === total || finished ? 'text-fg-muted' : 'text-warning-fg'
              }`}
            >
              {done}/{total}
            </span>
          </span>
        );
      },
    },
    {
      header: 'Estimate',
      align: 'right',
      numeric: true,
      render: (r) =>
        r.estimateMinor === null ? (
          <span className="text-fg-subtle">-</span>
        ) : (
          formatMoney(r.estimateMinor)
        ),
    },
    {
      header: 'Status',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{humanize(r.status)}</Badge>,
    },
  ];

  const empty = EMPTY_COPY[tab];
  const planButton = (variant: 'primary' | 'secondary') =>
    canPlan ? (
      <Button
        variant={variant}
        icon={<Plus size={18} aria-hidden="true" />}
        onClick={() => setPlanning(true)}
      >
        Plan procedure
      </Button>
    ) : undefined;

  return (
    <>
      <InkSheet>
        <SheetHead
          title="Procedures"
          description="Plan, schedule and track procedures and surgeries."
          figures={
            <Figures
              loading={list.loading && !list.data}
              items={[
                { label: 'To schedule', value: counts.PLANNED },
                { label: 'Scheduled', value: counts.SCHEDULED },
                { label: 'Under way', value: counts.IN_PROGRESS },
                {
                  label: 'Not ready',
                  value: notReady,
                  tone: notReady > 0 ? 'warning' : undefined,
                },
              ]}
            />
          }
          action={planButton('primary')}
        />
        <SheetBar
          actions={
            <span className="text-[12px] text-fg-subtle">
              Ready counts consent plus each checklist item
            </span>
          }
        >
          <InkFilters<TabKey>
            label="Procedure lists"
            value={tab}
            onChange={setTab}
            options={(Object.keys(TAB_LABEL) as TabKey[]).map((key) => ({
              key,
              label: TAB_LABEL[key],
              count: list.data ? counts[key] : undefined,
            }))}
          />
        </SheetBar>

        {list.errorStatus !== undefined && !list.loading ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <WarningCircle size={24} aria-hidden="true" className="text-danger-fg" />
            <p className="text-sm text-fg-muted">
              {list.errorStatus === 403
                ? 'You do not have access to procedures.'
                : (list.errorMessage ?? 'This could not be loaded.')}
            </p>
            <Button variant="secondary" onClick={list.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <RuledTable
            caption="Procedures"
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            loading={list.loading}
            onRowClick={(r) => router.push(`/procedures/${r.id}`)}
            empty={
              <EmptyState
                icon={Scissors}
                title={empty.title}
                description={empty.description}
                action={tab === 'PLANNED' ? planButton('secondary') : undefined}
              />
            }
          />
        )}
      </InkSheet>

      <PlanProcedureDialog
        open={planning}
        onClose={() => setPlanning(false)}
        onSaved={list.reload}
      />
    </>
  );
}
