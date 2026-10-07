'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ShieldCheck, Warning } from '@phosphor-icons/react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { Figures, InkFilters, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { RuledTable } from '../../../components/ui/ruled-table';
import { formatDate, formatMoney, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { NewCaseDialog } from './_components/new-case-dialog';
import { StageTicks } from './_components/case-timeline';
import {
  awaitsInsurer,
  isOpenCase,
  rupeeFigure,
  stageOf,
  STATUS_LABEL,
  STATUS_TONE,
  type CaseRow,
  type Stage,
} from './_components/insurance-types';

type Tab = 'eligibility' | 'preauth' | 'claims' | 'settled' | 'all';

const TABS: { key: Tab; label: string }[] = [
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'preauth', label: 'Pre-authorisation' },
  { key: 'claims', label: 'Claims' },
  { key: 'settled', label: 'Settled' },
  { key: 'all', label: 'All' },
];

const inTab = (row: CaseRow, tab: Tab) => tab === 'all' || stageOf(row.status) === (tab as Stage);

const money = (value: number | null) =>
  value === null ? <span className="text-fg-subtle">-</span> : formatMoney(value);

export default function InsurancePage() {
  const user = useStaff();
  const router = useRouter();
  const allowed = can(user.role, 'insurance:manage');
  const [tab, setTab] = useState<Tab>('all');
  const [creating, setCreating] = useState(false);
  const { data, loading, errorStatus, reload } = useApi<CaseRow[]>(
    allowed ? '/insurance/cases' : null,
  );

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const rows = data?.filter((r) => inTab(r, tab));
  const count = (t: Tab) => data?.filter((r) => inTab(r, t)).length;

  const open = data?.filter((r) => isOpenCase(r.status));
  const sum = (rows: CaseRow[] | undefined, pick: (r: CaseRow) => number | null) =>
    rows?.reduce((total, r) => total + (pick(r) ?? 0), 0);
  const approvedUnsettled = sum(
    data?.filter((r) => r.status === 'CLAIM_APPROVED' || r.status === 'CLAIM_PARTIALLY_APPROVED'),
    (r) => r.approvedAmountMinor,
  );
  const settled = sum(data, (r) => r.settledAmountMinor);

  const columns: Column<CaseRow>[] = [
    {
      header: 'Patient',
      render: (r) => (
        <Link href={`/insurance/${r.id}`} className="block min-w-0 hover:text-primary">
          <span className="block truncate font-medium">{fullName(r.patient)}</span>
          <span className="block truncate text-[12px] text-fg-muted">
            {r.policy.insurerName}
            {r.policy.tpaName ? ` · TPA ${r.policy.tpaName}` : ''}
          </span>
        </Link>
      ),
    },
    {
      header: 'Policy',
      render: (r) => (
        <span className="tabular font-mono text-[12px] text-fg-muted">{r.policy.policyNumber}</span>
      ),
    },
    {
      header: 'Stage',
      render: (r) => (
        <span className="flex items-center gap-3">
          <StageTicks status={r.status} />
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        </span>
      ),
    },
    {
      header: 'Requested',
      align: 'right',
      numeric: true,
      render: (r) => money(r.requestedAmountMinor),
    },
    {
      header: 'Approved',
      align: 'right',
      numeric: true,
      render: (r) => money(r.approvedAmountMinor),
    },
    {
      header: 'Updated',
      align: 'right',
      numeric: true,
      render: (r) => <span className="text-fg-muted">{formatDate(r.updatedAt)}</span>,
    },
  ];

  const newButton = (
    <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
      New case
    </Button>
  );

  return (
    <>
      <InkSheet>
        <SheetHead
          title="Insurance"
          description="Eligibility, pre-authorisation and claims, recorded by hand from what the insurer says."
          figures={
            <Figures
              loading={loading && !data}
              items={[
                { label: 'Open cases', value: open?.length },
                {
                  label: 'Waiting on insurer',
                  value: open?.filter((r) => awaitsInsurer(r.status)).length,
                },
                {
                  label: 'Approved, not settled',
                  value:
                    approvedUnsettled === undefined ? undefined : rupeeFigure(approvedUnsettled),
                },
                {
                  label: 'Settled',
                  value: settled === undefined ? undefined : rupeeFigure(settled),
                },
              ]}
            />
          }
          action={newButton}
        />
        <SheetBar
          actions={
            <span className="text-[12px] text-fg-subtle">No insurer system is connected</span>
          }
        >
          <InkFilters<Tab>
            label="Case stage"
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ ...t, count: count(t.key) }))}
          />
        </SheetBar>
        {errorStatus && !data ? (
          <div role="alert" className="flex items-center gap-3 px-8 py-6 text-sm text-danger-fg">
            <Warning size={20} aria-hidden="true" />
            <span>The cases could not be loaded.</span>
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : (
          <RuledTable
            caption="Insurance cases"
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            loading={loading}
            onRowClick={(r) => router.push(`/insurance/${r.id}`)}
            isMuted={(r) => !isOpenCase(r.status)}
            capNotice={
              data && data.length >= 200
                ? 'Showing the 200 most recently updated cases.'
                : undefined
            }
            empty={
              <EmptyState
                icon={ShieldCheck}
                title={tab === 'all' ? 'No insurance cases yet' : 'Nothing in this stage'}
                description={
                  tab === 'all'
                    ? 'Open a case when a patient wants to use their policy.'
                    : 'Cases appear here as they reach this stage. Check the other stages or open a new case.'
                }
                action={tab === 'all' ? newButton : undefined}
              />
            }
          />
        )}
      </InkSheet>

      <NewCaseDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          router.push(`/insurance/${created.id}`);
        }}
      />
    </>
  );
}
