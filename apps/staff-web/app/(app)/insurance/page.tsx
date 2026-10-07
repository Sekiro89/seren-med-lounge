'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ShieldCheck, Warning } from '@phosphor-icons/react';
import { PersonCell } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Tabs } from '../../../components/ui/tabs';
import { formatDate, formatMoney, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { NewCaseDialog } from './_components/new-case-dialog';
import {
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
  value === null ? <span className="text-fg-subtle">Not set</span> : formatMoney(value);

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

  const columns: Column<CaseRow>[] = [
    {
      header: 'Patient',
      render: (r) => (
        <Link href={`/insurance/${r.id}`} className="block rounded-control hover:text-primary">
          <PersonCell name={fullName(r.patient)} sub={r.policy.insurerName} />
        </Link>
      ),
    },
    {
      header: 'Policy number',
      render: (r) => (
        <span className="tabular font-mono text-fg-muted">{r.policy.policyNumber}</span>
      ),
    },
    {
      header: 'Requested',
      align: 'right',
      numeric: true,
      render: (r) => <span className="tabular font-mono">{money(r.requestedAmountMinor)}</span>,
    },
    {
      header: 'Approved',
      align: 'right',
      numeric: true,
      render: (r) => <span className="tabular font-mono">{money(r.approvedAmountMinor)}</span>,
    },
    {
      header: 'Status',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
    {
      header: 'Updated',
      render: (r) => <span className="font-mono text-fg-muted">{formatDate(r.updatedAt)}</span>,
    },
  ];

  const newButton = (
    <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
      New case
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Insurance"
        description="Eligibility, pre-authorisation and claims. Staff record each step by hand from what the insurer says; no insurer system is connected."
        action={newButton}
      />

      <Card>
        <div className="px-6">
          <Tabs
            label="Case stage"
            value={tab}
            onChange={setTab}
            tabs={TABS.map((t) => ({ ...t, count: count(t.key) }))}
          />
        </div>
        {errorStatus && !data ? (
          <div role="alert" className="flex items-center gap-3 px-6 py-6 text-sm text-danger-fg">
            <Warning size={20} aria-hidden="true" />
            <span>The cases could not be loaded.</span>
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            loading={loading}
            empty={
              <EmptyState
                icon={ShieldCheck}
                title={tab === 'all' ? 'No insurance cases yet' : 'Nothing in this stage'}
                description={
                  tab === 'all'
                    ? 'Open a case when a patient wants to use their policy.'
                    : 'Cases appear here as they reach this stage. Check the other tabs or open a new case.'
                }
                action={tab === 'all' ? newButton : undefined}
              />
            }
          />
        )}
        {data && data.length >= 200 && (
          <p className="border-t border-line px-6 py-4 text-[13px] text-fg-subtle">
            Showing the 200 most recently updated cases.
          </p>
        )}
      </Card>

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
