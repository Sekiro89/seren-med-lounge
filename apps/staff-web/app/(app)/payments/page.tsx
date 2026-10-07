'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CurrencyInr, Warning } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import {
  DateRangePicker,
  presetRange,
  rangeLabel,
  type DateRange,
  type RangePreset,
} from '../../../components/ui/date-range';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { Skeleton } from '../../../components/ui/skeleton';
import {
  Figures,
  InkFilters,
  InkSection,
  InkSheet,
  LedgerLine,
  MarginNote,
  RuledBar,
  SheetHead,
  SheetRail,
} from '../../../components/ui/ink';
import { LedgerTable, type LedgerColumn } from '../../../components/ui/ledger-table';
import { formatDate, formatMoney, formatTime, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { invoiceLabel } from '../billing/_components/billing-types';

interface RefundRow {
  id?: string;
  amountMinor: number;
  reason: string;
  createdAt: string;
  issuedBy?: { fullName: string } | null;
}

interface PaymentRow {
  id: string;
  method: string;
  amountMinor: number;
  reference: string | null;
  createdAt: string;
  invoice: {
    id: string;
    number: number;
    status: string;
    totalMinor: number;
    paidMinor: number;
    patient: { firstName: string; lastName: string };
  };
  receivedBy: { fullName: string } | null;
  refunds: RefundRow[];
}

const METHODS = ['CASH', 'UPI', 'CARD', 'INSURANCE'] as const;
type Method = (typeof METHODS)[number];

const METHOD_LABEL: Record<Method, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  INSURANCE: 'Insurance',
};
const methodLabel = (m: string) => METHOD_LABEL[m as Method] ?? humanize(m);

const refundedOf = (p: PaymentRow) => p.refunds.reduce((sum, r) => sum + r.amountMinor, 0);

/** `?from=YYYY-MM-DD&to=YYYY-MM-DD` (from Reports) opens the ledger on that range. */
export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsLedger />
    </Suspense>
  );
}

function PaymentsLedger() {
  const params = useSearchParams();
  const user = useStaff();
  const allowed = can(user.role, 'payment:manage');
  const [preset, setPreset] = useState<RangePreset>('today');
  const [range, setRange] = useState<DateRange>(() => {
    const from = params.get('from');
    const to = params.get('to');
    const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    return isDate(from) && isDate(to) && from <= to ? { from, to } : presetRange('today');
  });
  const [method, setMethod] = useState<'' | Method>('');

  const { data, loading, errorStatus, reload } = useApi<PaymentRow[]>(
    allowed ? `/payments?from=${range.from}&to=${range.to}` : null,
  );

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const rows = data?.filter((p) => !method || p.method === method);
  const collected = rows?.reduce((sum, p) => sum + p.amountMinor, 0);
  const refunded = rows?.reduce((sum, p) => sum + refundedOf(p), 0);
  const byMethod = METHODS.map((m) => {
    const set = data?.filter((p) => p.method === m) ?? [];
    return { method: m, n: set.length, amount: set.reduce((sum, p) => sum + p.amountMinor, 0) };
  });
  const maxMethod = Math.max(1, ...byMethod.map((m) => m.amount));
  const takers = new Map<string, { n: number; amount: number }>();
  for (const p of rows ?? []) {
    const key = p.receivedBy?.fullName ?? 'Unknown';
    const t = takers.get(key) ?? { n: 0, amount: 0 };
    takers.set(key, { n: t.n + 1, amount: t.amount + p.amountMinor });
  }
  const byTaker = [...takers.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const showsMultipleDays = range.from !== range.to;

  const columns: LedgerColumn<PaymentRow>[] = [
    {
      header: showsMultipleDays ? 'When' : 'Time',
      width: showsMultipleDays ? 'w-[150px]' : 'w-[72px]',
      numeric: true,
      render: (p) => (
        <span className="whitespace-nowrap">
          {showsMultipleDays && <span className="text-fg-muted">{formatDate(p.createdAt)} </span>}
          {formatTime(p.createdAt)}
        </span>
      ),
    },
    {
      header: 'Bill',
      width: 'w-[116px]',
      render: (p) => (
        <Link
          href={`/billing?invoice=${p.invoice.id}`}
          className="tabular whitespace-nowrap font-mono font-medium text-primary hover:text-primary-hover"
          title="Open this bill"
        >
          {invoiceLabel(p.invoice.number)}
        </Link>
      ),
    },
    {
      header: 'Patient',
      render: (p) => <span className="font-medium">{fullName(p.invoice.patient)}</span>,
    },
    { header: 'Method', width: 'w-[96px]', render: (p) => methodLabel(p.method) },
    {
      header: 'Reference',
      render: (p) =>
        p.reference ? (
          <span className="tabular font-mono text-[12px] text-fg-muted">{p.reference}</span>
        ) : (
          <span className="text-fg-subtle">None</span>
        ),
    },
    {
      header: 'Taken by',
      render: (p) => p.receivedBy?.fullName ?? <span className="text-fg-subtle">Unknown</span>,
    },
    {
      header: 'Refunded',
      align: 'right',
      numeric: true,
      render: (p) => {
        const amount = refundedOf(p);
        return amount > 0 ? (
          <span className="text-danger-fg">-{formatMoney(amount)}</span>
        ) : (
          <span className="text-fg-subtle">-</span>
        );
      },
    },
    {
      header: 'Amount',
      align: 'right',
      numeric: true,
      render: (p) => <span className="font-medium">{formatMoney(p.amountMinor)}</span>,
    },
  ];

  return (
    <InkSheet>
      <SheetHead
        eyebrow={rangeLabel(range)}
        title="Payments"
        description="Every payment taken, newest first, with any refunds against it."
        figures={
          <Figures
            size="sm"
            loading={loading && !data}
            items={[
              {
                label: 'Collected',
                value: collected === undefined ? undefined : formatMoney(collected),
                hint: rows ? `${rows.length} payment${rows.length === 1 ? '' : 's'}` : undefined,
              },
              {
                label: 'Refunded',
                value: refunded === undefined ? undefined : formatMoney(refunded),
                tone: refunded ? 'danger' : undefined,
              },
              {
                label: 'Net',
                value:
                  collected === undefined || refunded === undefined
                    ? undefined
                    : formatMoney(collected - refunded),
                hint: method ? `${METHOD_LABEL[method]} only` : 'All methods',
              },
            ]}
          />
        }
      />

      <div className="border-b border-line px-5 py-4 sm:px-8">
        <DateRangePicker
          value={range}
          preset={preset}
          onChange={(next, key) => {
            setRange(next);
            setPreset(key);
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Payments ledger" className="min-w-0">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-2 sm:px-8">
            <h2 className="text-[14px] font-semibold text-fg">Ledger</h2>
            <InkFilters
              label="Method"
              value={method}
              onChange={setMethod}
              options={[
                { key: '', label: 'All methods', count: data?.length },
                ...METHODS.map((m) => ({
                  key: m,
                  label: METHOD_LABEL[m],
                  count: data ? byMethod.find((b) => b.method === m)?.n : undefined,
                })),
              ]}
            />
          </div>
          {errorStatus !== undefined && !data ? (
            <div role="alert" className="flex items-center gap-3 px-8 py-6 text-sm text-danger-fg">
              <Warning size={20} aria-hidden="true" />
              <span>The payments could not be loaded.</span>
              <Button size="sm" variant="secondary" onClick={reload}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <LedgerTable
                columns={columns}
                rows={rows}
                getRowKey={(p) => p.id}
                loading={loading}
                minWidth={860}
                caption="Payments"
                empty={
                  <EmptyState
                    icon={CurrencyInr}
                    title={method ? `No ${METHOD_LABEL[method]} payments` : 'No payments'}
                    description={
                      method
                        ? 'Choose another method or a wider period.'
                        : 'Payments recorded against invoices in this period appear here.'
                    }
                    action={
                      method ? (
                        <Button variant="secondary" onClick={() => setMethod('')}>
                          Show all methods
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />
              {rows && rows.length > 0 && collected !== undefined && refunded !== undefined && (
                <dl className="ml-auto max-w-[320px] px-5 pb-6 pt-2 sm:px-8">
                  <LedgerLine label="Collected" value={formatMoney(collected)} />
                  <LedgerLine
                    label="Refunded"
                    value={refunded > 0 ? `-${formatMoney(refunded)}` : formatMoney(0)}
                    tone={refunded > 0 ? 'danger' : 'muted'}
                  />
                  <div className="border-y-2 border-double border-fg">
                    <LedgerLine label="Net" value={formatMoney(collected - refunded)} strong />
                  </div>
                </dl>
              )}
            </>
          )}
        </section>

        <SheetRail label="Payments by method and by staff">
          <InkSection title="By method" meta={data ? 'All methods, this period' : undefined}>
            {loading && !data ? (
              <Skeleton className="mt-2 h-24 w-full" />
            ) : (
              <ul className="divide-y divide-line">
                {byMethod.map((m) => (
                  <li key={m.method} className="py-2 text-[13px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={method === m.method ? 'font-medium text-fg' : 'text-fg'}>
                        {METHOD_LABEL[m.method]}
                        <span className="tabular ml-1.5 font-mono text-[12px] text-fg-subtle">
                          {m.n}
                        </span>
                      </span>
                      <span className="tabular font-mono text-fg">{formatMoney(m.amount)}</span>
                    </div>
                    <RuledBar
                      value={m.amount}
                      max={maxMethod}
                      tone={method === m.method ? 'primary' : 'ink'}
                      className="mt-1.5"
                    />
                  </li>
                ))}
              </ul>
            )}
          </InkSection>

          <InkSection title="Taken by">
            {loading && !data ? (
              <Skeleton className="mt-2 h-16 w-full" />
            ) : byTaker.length === 0 ? (
              <MarginNote className="pt-2">No payments in this period.</MarginNote>
            ) : (
              <ul className="divide-y divide-line">
                {byTaker.map(([name, t]) => (
                  <li
                    key={name}
                    className="flex items-baseline justify-between gap-3 py-2 text-[13px]"
                  >
                    <span className="truncate text-fg">
                      {name}
                      <span className="tabular ml-1.5 font-mono text-[12px] text-fg-subtle">
                        {t.n}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-mono text-fg">
                      {formatMoney(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </InkSection>

          <MarginNote>
            Refunds are issued from the bill. Open a bill number to see it as the printed invoice.
          </MarginNote>
        </SheetRail>
      </div>
    </InkSheet>
  );
}
