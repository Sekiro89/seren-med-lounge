'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CurrencyInr, Warning } from '@phosphor-icons/react';
import { PersonCell } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import {
  DateRangePicker,
  presetRange,
  rangeLabel,
  type DateRange,
  type RangePreset,
} from '../../../components/ui/date-range';
import { EmptyState } from '../../../components/ui/empty-state';
import { Select } from '../../../components/ui/fields';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
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
  const byMethod = METHODS.map((m) => ({
    method: m,
    amount: data?.filter((p) => p.method === m).reduce((sum, p) => sum + p.amountMinor, 0) ?? 0,
  })).filter((m) => m.amount > 0);
  const showsMultipleDays = range.from !== range.to;

  const columns: Column<PaymentRow>[] = [
    {
      header: showsMultipleDays ? 'When' : 'Time',
      render: (p) => (
        <span className="tabular whitespace-nowrap font-mono">
          {showsMultipleDays ? `${formatDate(p.createdAt)}, ` : ''}
          {formatTime(p.createdAt)}
        </span>
      ),
    },
    { header: 'Patient', render: (p) => <PersonCell name={fullName(p.invoice.patient)} /> },
    {
      header: 'Bill',
      render: (p) => (
        <Link
          href={`/billing?invoice=${p.invoice.id}`}
          className="font-mono font-medium text-primary hover:text-primary-hover"
          title="Open this bill"
        >
          {invoiceLabel(p.invoice.number)}
        </Link>
      ),
    },
    { header: 'Method', render: (p) => methodLabel(p.method) },
    {
      header: 'Reference',
      render: (p) =>
        p.reference ? (
          <span className="tabular font-mono text-fg-muted">{p.reference}</span>
        ) : (
          <span className="text-fg-subtle">None</span>
        ),
    },
    {
      header: 'Amount',
      align: 'right',
      render: (p) => <span className="font-medium">{formatMoney(p.amountMinor)}</span>,
    },
    {
      header: 'Taken by',
      render: (p) => p.receivedBy?.fullName ?? <span className="text-fg-subtle">Unknown</span>,
    },
    {
      header: 'Refunds',
      render: (p) => {
        const amount = refundedOf(p);
        return amount > 0 ? (
          <Badge tone="warning">Refunded {formatMoney(amount)}</Badge>
        ) : (
          <span className="text-fg-subtle">None</span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={rangeLabel(range)}
        title="Payments"
        description="Every payment taken, newest first, with any refunds against it."
      />

      <Card className="mb-6">
        <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
          <DateRangePicker
            value={range}
            preset={preset}
            onChange={(next, key) => {
              setRange(next);
              setPreset(key);
            }}
          />
          <div className="w-48">
            <label htmlFor="pay-method" className="sr-only">
              Method
            </label>
            <Select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as '' | Method)}
              className="h-9"
            >
              <option value="">All methods</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Total label="Collected" value={collected} loading={loading} />
        <Total label="Refunded" value={refunded} loading={loading} />
        <Total
          label="Net"
          value={
            collected === undefined || refunded === undefined ? undefined : collected - refunded
          }
          loading={loading}
          strong
        />
      </div>

      {!loading && byMethod.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {byMethod.map((m) => (
            <Badge key={m.method} tone={method === m.method ? 'info' : 'neutral'}>
              {METHOD_LABEL[m.method]} {formatMoney(m.amount)}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        {errorStatus !== undefined && !data ? (
          <div role="alert" className="flex items-center gap-3 px-6 py-6 text-sm text-danger-fg">
            <Warning size={20} aria-hidden="true" />
            <span>The payments could not be loaded.</span>
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(p) => p.id}
            loading={loading}
            empty={
              <EmptyState
                icon={CurrencyInr}
                title={method ? `No  payments` : 'No payments'}
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
        )}
      </Card>
    </>
  );
}

function Total({
  label,
  value,
  loading,
  strong,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  strong?: boolean;
}) {
  return (
    <div className="rounded-panel border border-line bg-surface px-6 py-5 shadow-card">
      <p className="text-[13px] font-medium text-fg-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-32" />
      ) : (
        <p
          className={`tabular mt-2 font-mono text-2xl leading-8 tracking-tight text-fg ${strong ? 'font-semibold' : 'font-medium'}`}
        >
          {value === undefined ? '-' : formatMoney(value)}
        </p>
      )}
    </div>
  );
}
