'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Receipt, Warning } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import {
  Figures,
  InkFilters,
  InkSection,
  InkSheet,
  InkStatus,
  MarginNote,
  RuledBar,
  SheetHead,
  SheetRail,
} from '../../../components/ui/ink';
import { LedgerTable, type LedgerColumn } from '../../../components/ui/ledger-table';
import { NoAccess } from '../../../components/ui/no-access';
import { Skeleton } from '../../../components/ui/skeleton';
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
const balanceOf = (i: InvoiceRow) => (i.status === 'VOID' ? 0 : i.totalMinor - i.paidMinor);

/** Whole days since an invoice was issued. */
const ageDays = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

const AGES = [
  { key: 'week', label: 'This week', test: (d: number) => d <= 7 },
  { key: 'month', label: '8 to 30 days', test: (d: number) => d > 7 && d <= 30 },
  { key: 'older', label: 'Older than 30 days', test: (d: number) => d > 30 },
] as const;

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
  const outstanding = unpaid?.reduce((sum, i) => sum + balanceOf(i), 0);
  const month = new Date().toISOString().slice(0, 7);
  const billedThisMonth = live
    ?.filter((i) => i.createdAt.slice(0, 7) === month)
    .reduce((sum, i) => sum + i.totalMinor, 0);
  const collected = live?.reduce((sum, i) => sum + i.paidMinor, 0);

  const matches: Record<Filter, (i: InvoiceRow) => boolean> = {
    all: () => true,
    unpaid: isUnpaid,
    paid: (i) => i.status === 'PAID',
    void: (i) => i.status === 'VOID',
  };
  const count = (f: Filter) => data?.filter(matches[f]).length;
  const rows = data?.filter(matches[filter]);

  const aging = AGES.map((a) => {
    const set = (unpaid ?? []).filter((i) => a.test(ageDays(i.createdAt)));
    return { ...a, n: set.length, amount: set.reduce((s, i) => s + balanceOf(i), 0) };
  });
  const maxAging = Math.max(1, ...aging.map((a) => a.amount));
  const largest = [...(unpaid ?? [])].sort((a, b) => balanceOf(b) - balanceOf(a)).slice(0, 5);

  const columns: LedgerColumn<InvoiceRow>[] = [
    {
      header: 'Invoice',
      width: 'w-[120px]',
      render: (i) => (
        <button
          type="button"
          onClick={() => setOpenId(i.id)}
          className="tabular cursor-pointer whitespace-nowrap font-mono font-medium text-primary hover:text-primary-hover"
        >
          {invoiceLabel(i.number)}
        </button>
      ),
    },
    {
      header: 'Patient',
      render: (i) => <span className="font-medium">{fullName(i.patient)}</span>,
    },
    {
      header: 'Issued',
      width: 'w-[112px]',
      numeric: true,
      render: (i) => <span className="text-fg-muted">{formatDate(i.createdAt)}</span>,
    },
    { header: 'Total', align: 'right', numeric: true, render: (i) => formatMoney(i.totalMinor) },
    {
      header: 'Paid',
      align: 'right',
      numeric: true,
      render: (i) => <span className="text-fg-muted">{formatMoney(i.paidMinor)}</span>,
    },
    {
      header: 'Balance',
      align: 'right',
      numeric: true,
      render: (i) => (
        <span className={balanceOf(i) > 0 ? 'font-medium' : 'text-fg-subtle'}>
          {formatMoney(balanceOf(i))}
        </span>
      ),
    },
    {
      header: 'Status',
      width: 'w-[128px]',
      render: (i) => <InkStatus domain="invoice" status={i.status} />,
    },
  ];

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow="Finance"
          title="Billing"
          description="Invoices, payments and refunds. Open an invoice to see it as the printed bill."
          figures={
            <Figures
              size="sm"
              loading={loading && !data}
              items={[
                {
                  label: 'Outstanding',
                  value: outstanding === undefined ? undefined : formatMoney(outstanding),
                  tone: outstanding ? 'warning' : undefined,
                  hint: unpaid
                    ? `${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'}`
                    : undefined,
                },
                {
                  label: 'Billed this month',
                  value: billedThisMonth === undefined ? undefined : formatMoney(billedThisMonth),
                  hint: 'Excludes void',
                },
                {
                  label: 'Collected on these',
                  value: collected === undefined ? undefined : formatMoney(collected),
                  hint: 'Paid against live invoices',
                },
              ]}
            />
          }
          action={
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
              New invoice
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label="Invoices" className="min-w-0">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-2 sm:px-8">
              <h2 className="text-[14px] font-semibold text-fg">Invoices</h2>
              <InkFilters
                label="Invoice status"
                value={filter}
                onChange={setFilter}
                options={[
                  { key: 'all', label: 'All', count: count('all') },
                  { key: 'unpaid', label: 'Unpaid', count: count('unpaid') },
                  { key: 'paid', label: 'Paid', count: count('paid') },
                  { key: 'void', label: 'Void', count: count('void') },
                ]}
              />
            </div>
            {errorStatus && !data ? (
              <div
                role="alert"
                className="flex items-center gap-3 px-8 py-6 text-sm text-danger-fg"
              >
                <Warning size={20} aria-hidden="true" />
                <span>The invoices could not be loaded.</span>
                <Button size="sm" variant="secondary" onClick={reload}>
                  Retry
                </Button>
              </div>
            ) : (
              <LedgerTable
                columns={columns}
                rows={rows}
                getRowKey={(i) => i.id}
                loading={loading}
                selectedKey={openId ?? undefined}
                muted={(i) => i.status === 'VOID'}
                minWidth={780}
                caption="Invoices"
                capNotice={
                  data && data.length >= 100
                    ? 'Showing the latest 100 invoices. Totals above cover these only.'
                    : undefined
                }
                empty={
                  <EmptyState
                    icon={Receipt}
                    title={filter === 'all' ? 'No invoices yet' : 'No invoices in this view'}
                    description={
                      filter === 'all'
                        ? 'Issue the first invoice for a patient.'
                        : 'Choose All to see every invoice.'
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
          </section>

          <SheetRail label="Outstanding balances">
            <InkSection
              title="Unpaid, by age"
              meta={outstanding !== undefined ? formatMoney(outstanding) : undefined}
            >
              {loading && !data ? (
                <Skeleton className="mt-2 h-20 w-full" />
              ) : (
                <ul className="divide-y divide-line">
                  {aging.map((a) => (
                    <li key={a.key} className="py-2 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-fg">
                          {a.label}
                          <span className="tabular ml-1.5 font-mono text-[12px] text-fg-subtle">
                            {a.n}
                          </span>
                        </span>
                        <span className="tabular font-mono text-fg">{formatMoney(a.amount)}</span>
                      </div>
                      <RuledBar
                        value={a.amount}
                        max={maxAging}
                        tone={a.key === 'older' && a.amount > 0 ? 'warning' : 'ink'}
                        className="mt-1.5"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </InkSection>

            <InkSection title="Largest balances">
              {loading && !data ? (
                <Skeleton className="mt-2 h-20 w-full" />
              ) : largest.length === 0 ? (
                <MarginNote className="pt-2">Every invoice is settled.</MarginNote>
              ) : (
                <ul className="divide-y divide-line">
                  {largest.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(i.id)}
                        className="flex w-full cursor-pointer items-baseline justify-between gap-3 py-2 text-left text-[13px] hover:bg-surface-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-fg">{fullName(i.patient)}</span>
                          <span className="tabular block font-mono text-[11px] text-fg-subtle">
                            {invoiceLabel(i.number)} · {ageDays(i.createdAt)}d
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-mono font-medium text-fg">
                          {formatMoney(balanceOf(i))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </InkSection>

            <MarginNote>
              Payments and refunds are recorded on the invoice. Voiding needs a reason and stays on
              the record.
            </MarginNote>
          </SheetRail>
        </div>
      </InkSheet>

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
