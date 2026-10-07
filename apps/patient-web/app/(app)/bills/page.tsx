'use client';

import { CheckCircle, Receipt, Storefront } from '@phosphor-icons/react';
import {
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  IconBadge,
  PageTitle,
  Rows,
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
          <Skeleton className="h-24" />
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
              <Rows>
                {toPay.map((invoice) => (
                  <li key={invoice.id}>
                    <BillCard invoice={invoice} />
                  </li>
                ))}
              </Rows>
            </section>
          )}
          {done.length > 0 && (
            <section aria-labelledby="paid">
              <SectionHeading>
                <span id="paid">{anyCancelled ? 'Paid and cancelled' : 'Paid'}</span>
              </SectionHeading>
              <Rows>
                {done.map((invoice) => (
                  <li key={invoice.id}>
                    <BillCard invoice={invoice} />
                  </li>
                ))}
              </Rows>
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
      <div className="flex items-center gap-4 border-y border-line py-5">
        <IconBadge icon={CheckCircle} tone="success" />
        <div>
          <p className="font-semibold text-success-fg">Nothing to pay</p>
          <p className="text-fg-muted">All your bills are settled.</p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm text-fg-muted">Total to pay</p>
      <p className="tabular mt-1 font-mono text-[3rem] font-medium leading-none tracking-[-0.02em] text-fg">
        {formatMoney(owed)}
      </p>
      <div className="mt-5 flex items-start gap-3 border-t border-line pt-4 text-fg-muted">
        <Storefront size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>Pay at the clinic desk. Online payment is coming soon.</p>
      </div>
    </div>
  );
}

function BillCard({ invoice }: { invoice: Invoice }) {
  const status = STATUS[invoice.status] ?? { label: 'Bill', tone: 'neutral' as Tone };
  const cancelled = invoice.status === 'VOID';
  const balance = invoice.totalMinor - invoice.paidMinor;

  return (
    <article className="py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">
            Bill <span className="font-mono">#{invoice.number}</span>
          </h3>
          <p className="text-sm text-fg-muted">{formatDate(invoice.createdAt)}</p>
        </div>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {invoice.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span className="min-w-0 text-fg-muted">{item.description}</span>
            <span className="tabular shrink-0 font-mono">{formatMoney(item.lineTotalMinor)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-col gap-1 border-t border-dashed border-line pt-3">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Total</dt>
          <dd className="tabular font-mono font-medium">{formatMoney(invoice.totalMinor)}</dd>
        </div>
        {!cancelled && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Paid</dt>
              <dd className="tabular font-mono">{formatMoney(invoice.paidMinor)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold">Balance</dt>
              <dd
                className={`tabular font-mono font-semibold ${balance > 0 ? 'text-warning-fg' : 'text-fg'}`}
              >
                {formatMoney(Math.max(0, balance))}
              </dd>
            </div>
          </>
        )}
      </dl>
      {cancelled && (
        <p className="mt-3 text-fg-muted">This bill was cancelled. You do not need to pay it.</p>
      )}
    </article>
  );
}
