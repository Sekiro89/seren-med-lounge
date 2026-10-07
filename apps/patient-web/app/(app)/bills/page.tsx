'use client';

import { CheckCircle, Receipt, Storefront } from '@phosphor-icons/react';
import {
  Card,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  IconBadge,
  PageTitle,
  SectionHeading,
  Skeleton,
  type Tone,
} from '../../../components/ui';
import { formatDate, formatMoney } from '../../../lib/format';
import type { Invoice } from '../../../lib/types';
import { useApi } from '../../../lib/use-api';

const OPEN = new Set(['ISSUED', 'PARTIALLY_PAID']);

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ISSUED: { label: 'To pay', tone: 'warning' },
  PARTIALLY_PAID: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  VOID: { label: 'Cancelled', tone: 'neutral' },
};

/** Outstanding bills first, then paid receipts (design system 18.6). No online payment yet. */
export default function BillsPage() {
  const invoices = useApi<Invoice[]>('/patients/me/invoices');
  const all = [...(invoices.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const toPay = all.filter((i) => OPEN.has(i.status));
  const done = all.filter((i) => !OPEN.has(i.status));
  const owed = toPay.reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0);
  const anyCancelled = done.some((i) => i.status === 'VOID');

  return (
    <div>
      <PageTitle title="Payments" description="Your bills, what you've paid, and what's left." />
      {invoices.loading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-32" />
          <CardsSkeleton count={2} />
        </div>
      ) : invoices.error ? (
        <ErrorNote message={invoices.error} onRetry={invoices.reload} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No bills yet"
          description="Bills from your visits will show up here, along with what you have paid."
        />
      ) : (
        <div className="flex flex-col gap-10">
          <Summary owed={owed} />
          {toPay.length > 0 && (
            <section aria-labelledby="to-pay">
              <SectionHeading>
                <span id="to-pay">To pay</span>
              </SectionHeading>
              <ul className="flex flex-col gap-4">
                {toPay.map((invoice) => (
                  <li key={invoice.id}>
                    <BillCard invoice={invoice} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {done.length > 0 && (
            <section aria-labelledby="paid">
              <SectionHeading>
                <span id="paid">{anyCancelled ? 'Paid and cancelled' : 'Paid'}</span>
              </SectionHeading>
              <ul className="flex flex-col gap-4">
                {done.map((invoice) => (
                  <li key={invoice.id}>
                    <BillCard invoice={invoice} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Summary({ owed }: { owed: number }) {
  if (owed <= 0) {
    return (
      <Card className="flex items-center gap-4">
        <IconBadge icon={CheckCircle} tone="success" />
        <div>
          <p className="text-lg font-bold text-success-fg">Nothing to pay</p>
          <p className="text-fg-muted">All your bills are settled.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <p className="font-semibold text-fg-muted">Total to pay</p>
      <p className="tabular mt-1 text-4xl font-bold leading-tight text-fg">{formatMoney(owed)}</p>
      <div className="mt-4 flex items-start gap-3 border-t border-line pt-4 text-fg-muted">
        <Storefront size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>Pay at the clinic desk. Online payment is coming soon.</p>
      </div>
    </Card>
  );
}

function BillCard({ invoice }: { invoice: Invoice }) {
  const status = STATUS[invoice.status] ?? { label: 'Bill', tone: 'neutral' as Tone };
  const cancelled = invoice.status === 'VOID';
  const balance = invoice.totalMinor - invoice.paidMinor;

  return (
    <Card as="article">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Bill #{invoice.number}</h3>
          <p className="text-fg-muted">{formatDate(invoice.createdAt)}</p>
        </div>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>

      <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        {invoice.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span className="min-w-0">{item.description}</span>
            <span className="tabular shrink-0">{formatMoney(item.lineTotalMinor)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-4">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Total</dt>
          <dd className="tabular font-semibold">{formatMoney(invoice.totalMinor)}</dd>
        </div>
        {!cancelled && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Paid</dt>
              <dd className="tabular">{formatMoney(invoice.paidMinor)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-bold">Balance</dt>
              <dd className={`tabular font-bold ${balance > 0 ? 'text-warning-fg' : 'text-fg'}`}>
                {formatMoney(Math.max(0, balance))}
              </dd>
            </div>
          </>
        )}
      </dl>
      {cancelled && (
        <p className="mt-3 text-fg-muted">This bill was cancelled. You do not need to pay it.</p>
      )}
    </Card>
  );
}
