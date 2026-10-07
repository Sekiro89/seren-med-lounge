'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Coins, Plus, Receipt, Warning } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { KpiTile } from '../../../components/ui/kpi-tile';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/badge';
import { PersonCell } from '../../../components/ui/avatar';
import { Tabs } from '../../../components/ui/tabs';
import { formatDate, formatMoney, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { invoiceLabel, type InvoiceRow } from './_components/billing-types';
import { InvoiceDrawer } from './_components/invoice-drawer';
import { NewInvoiceDialog } from './_components/new-invoice-dialog';

type Filter = 'all' | 'unpaid' | 'paid' | 'void';

const isUnpaid = (i: InvoiceRow) => i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID';

/** `?invoice=<id>` (from Payments, Reports) opens that bill's drawer straight away. */
export default function BillingPage() {
  return (
    <Suspense>
      <BillingDesk />
    </Suspense>
  );
}

function BillingDesk() {
  const user = useStaff();
  const requested = useSearchParams().get('invoice');
  const allowed = can(user.role, 'invoice:manage');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(requested);

  const { data, loading, errorStatus, reload } = useApi<InvoiceRow[]>(allowed ? '/invoices' : null);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const live = data?.filter((i) => i.status !== 'VOID');
  const unpaid = data?.filter(isUnpaid);
  const outstanding = unpaid?.reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0);
  const month = new Date().toISOString().slice(0, 7);
  const billedThisMonth = live
    ?.filter((i) => i.createdAt.slice(0, 7) === month)
    .reduce((sum, i) => sum + i.totalMinor, 0);

  const matches: Record<Filter, (i: InvoiceRow) => boolean> = {
    all: () => true,
    unpaid: isUnpaid,
    paid: (i) => i.status === 'PAID',
    void: (i) => i.status === 'VOID',
  };
  const count = (f: Filter) => data?.filter(matches[f]).length;
  const rows = data?.filter(matches[filter]);

  const columns: Column<InvoiceRow>[] = [
    {
      header: 'Invoice',
      render: (i) => (
        <button
          type="button"
          onClick={() => setOpenId(i.id)}
          className="cursor-pointer font-mono font-medium text-primary hover:text-primary-hover"
        >
          {invoiceLabel(i.number)}
        </button>
      ),
    },
    {
      header: 'Patient',
      render: (i) => <PersonCell name={fullName(i.patient)} />,
    },
    { header: 'Total', align: 'right', render: (i) => formatMoney(i.totalMinor) },
    { header: 'Paid', align: 'right', render: (i) => formatMoney(i.paidMinor) },
    {
      header: 'Balance',
      align: 'right',
      render: (i) => (
        <span className="font-medium">
          {formatMoney(i.status === 'VOID' ? 0 : i.totalMinor - i.paidMinor)}
        </span>
      ),
    },
    { header: 'Status', render: (i) => <StatusBadge domain="invoice" status={i.status} /> },
    {
      header: 'Created',
      render: (i) => <span className="text-fg-muted">{formatDate(i.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Billing"
        description="Invoices, payments and refunds."
        action={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            New invoice
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiTile
          label="Outstanding balance"
          value={outstanding === undefined ? undefined : formatMoney(outstanding)}
          hint="Across unpaid invoices"
          icon={Coins}
          tone="warning"
          loading={loading}
        />
        <KpiTile
          label="Unpaid invoices"
          value={unpaid?.length}
          hint="Issued or partly paid"
          icon={Receipt}
          tone="info"
          loading={loading}
        />
        <KpiTile
          label="Billed this month"
          value={billedThisMonth === undefined ? undefined : formatMoney(billedThisMonth)}
          hint="Excludes void invoices"
          icon={Receipt}
          loading={loading}
        />
      </div>

      <Card>
        <div className="px-5">
          <Tabs
            label="Invoice status"
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: 'all', label: 'All', count: count('all') },
              { key: 'unpaid', label: 'Unpaid', count: count('unpaid') },
              { key: 'paid', label: 'Paid', count: count('paid') },
              { key: 'void', label: 'Void', count: count('void') },
            ]}
          />
        </div>
        {errorStatus && !data ? (
          <div role="alert" className="flex items-center gap-3 px-5 py-6 text-sm text-danger-fg">
            <Warning size={20} aria-hidden="true" />
            <span>The invoices could not be loaded.</span>
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(i) => i.id}
            loading={loading}
            empty={
              <EmptyState
                icon={Receipt}
                title={filter === 'all' ? 'No invoices yet' : 'No invoices in this view'}
                description={
                  filter === 'all'
                    ? 'Issue the first invoice for a patient.'
                    : 'Switch tabs to see other invoices.'
                }
                action={
                  filter === 'all' ? (
                    <Button
                      icon={<Plus size={18} aria-hidden="true" />}
                      onClick={() => setCreating(true)}
                    >
                      New invoice
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}
        {data && data.length >= 100 && (
          <p className="border-t border-line px-5 py-3 text-[13px] text-fg-subtle">
            Showing the latest 100 invoices. Totals above cover these only.
          </p>
        )}
      </Card>

      <NewInvoiceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(invoice) => {
          setCreating(false);
          setFilter('all');
          reload();
          setOpenId(invoice.id);
        }}
      />
      <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(null)} onChanged={reload} />
    </>
  );
}
