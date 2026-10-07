'use client';

import { useState } from 'react';
import { ArrowUUpLeft, CreditCard, Prohibit } from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { InkStatus, LedgerLine } from '../../../../components/ui/ink';
import { Skeleton } from '../../../../components/ui/skeleton';
import { formatDate, formatMoney, fullName, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { RecordPaymentDialog, RefundDialog, VoidDialog } from './action-dialogs';
import { invoiceLabel, refundedOf, type InvoiceDetail, type PaymentRow } from './billing-types';

type Action = { kind: 'pay' } | { kind: 'void' } | { kind: 'refund'; payment: PaymentRow };

export function InvoiceDrawer({
  invoiceId,
  onClose,
  onChanged,
}: {
  invoiceId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const user = useStaff();
  const [action, setAction] = useState<Action>();
  const {
    data: invoice,
    loading,
    errorStatus,
    reload,
  } = useApi<InvoiceDetail>(invoiceId ? `/invoices/${invoiceId}` : null);
  const current = invoice && invoice.id === invoiceId ? invoice : undefined;

  const done = () => {
    setAction(undefined);
    reload();
    onChanged();
  };

  const balance = current ? current.totalMinor - current.paidMinor : 0;
  const open = current && current.status !== 'VOID';
  const canPay = can(user.role, 'payment:manage') && open && balance > 0;
  const canVoid = can(user.role, 'invoice:manage') && open;
  const canRefund = can(user.role, 'refund:issue');

  return (
    <>
      <Dialog
        variant="drawer"
        open={invoiceId !== null}
        onClose={onClose}
        title="Invoice"
        description={current ? fullName(current.patient) : undefined}
        footer={
          current && (canPay || canVoid) ? (
            <>
              {canVoid && (
                <Button
                  variant="secondary"
                  icon={<Prohibit size={18} aria-hidden="true" />}
                  onClick={() => setAction({ kind: 'void' })}
                >
                  Void
                </Button>
              )}
              {canPay && (
                <Button
                  icon={<CreditCard size={18} aria-hidden="true" />}
                  onClick={() => setAction({ kind: 'pay' })}
                >
                  Record payment
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {errorStatus && !current ? (
          <p role="alert" className="bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            This invoice could not be loaded.{' '}
            <button type="button" onClick={reload} className="cursor-pointer font-medium underline">
              Retry
            </button>
          </p>
        ) : loading || !current ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <article aria-label={`Invoice ${invoiceLabel(current.number)}`} className="text-fg">
            {/* Letterhead: the printed bill */}
            <div className="flex items-start justify-between gap-6 border-b border-fg pb-4">
              <div className="min-w-0">
                <p className="text-xs text-fg-muted">SereneMed Lounge · Tax invoice</p>
                <p className="tabular mt-1 font-mono text-[26px] font-medium leading-none tracking-tight">
                  {invoiceLabel(current.number)}
                </p>
              </div>
              <div className="shrink-0 pt-0.5 text-right">
                <InkStatus domain="invoice" status={current.status} />
                <p className="tabular mt-1.5 font-mono text-[12px] text-fg-muted">
                  {formatDate(current.createdAt)}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-1 border-b border-line py-3 text-[13px]">
              <dt className="text-fg-muted">Billed to</dt>
              <dd className="font-medium">{fullName(current.patient)}</dd>
              <dt className="text-fg-muted">Issued</dt>
              <dd className="tabular font-mono">{formatDate(current.createdAt)}</dd>
            </dl>

            {current.status === 'VOID' && (
              <p className="mt-4 bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                Voided{current.voidedAt ? ` on ${formatDate(current.voidedAt)}` : ''}
                {current.voidReason ? `: ${current.voidReason}` : '.'}
              </p>
            )}

            <section aria-labelledby="items-h" className="mt-5">
              <h3 id="items-h" className="sr-only">
                Items
              </h3>
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="h-8 border-b border-fg text-[11px] text-fg-muted">
                    <th scope="col" className="pr-2 font-medium">
                      Item
                    </th>
                    <th scope="col" className="w-10 px-2 text-right font-medium">
                      Qty
                    </th>
                    <th scope="col" className="px-2 text-right font-medium">
                      Rate
                    </th>
                    <th scope="col" className="pl-2 text-right font-medium">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {current.items.map((item, index) => (
                    <tr key={item.id} className="border-b border-line align-top">
                      <td className="py-2 pr-2">
                        <p>
                          <span className="tabular mr-1.5 font-mono text-[11px] text-fg-subtle">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="font-medium">{item.description}</span>
                        </p>
                        <p className="pl-6 text-[12px] text-fg-subtle">
                          {humanize(item.itemType)}
                          {item.taxMinor > 0 && (
                            <>
                              {' '}
                              · tax{' '}
                              <span className="tabular font-mono">
                                {formatMoney(item.taxMinor)}
                              </span>
                            </>
                          )}
                        </p>
                      </td>
                      <td className="tabular px-2 py-2 text-right font-mono">{item.quantity}</td>
                      <td className="tabular px-2 py-2 text-right font-mono text-fg-muted">
                        {formatMoney(item.unitPriceMinor)}
                      </td>
                      <td className="tabular py-2 pl-2 text-right font-mono font-medium">
                        {formatMoney(item.lineTotalMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="ml-auto mt-3 w-full max-w-[260px]">
                <LedgerLine label="Subtotal" value={formatMoney(current.subtotalMinor)} />
                <LedgerLine label="Tax" value={formatMoney(current.taxMinor)} />
                <div className="border-t border-fg">
                  <LedgerLine label="Total" value={formatMoney(current.totalMinor)} strong />
                </div>
                <LedgerLine label="Paid" value={formatMoney(current.paidMinor)} tone="muted" />
                <div className="border-y-2 border-double border-fg">
                  <LedgerLine
                    label="Balance due"
                    value={formatMoney(current.status === 'VOID' ? 0 : balance)}
                    strong
                  />
                </div>
              </dl>
              {current.notes && (
                <p className="mt-4 border-l-2 border-line pl-3 text-[13px] text-fg-muted">
                  {current.notes}
                </p>
              )}
            </section>

            <section aria-labelledby="pay-h" className="mt-8">
              <h3
                id="pay-h"
                className="section-rule flex min-h-10 items-center pt-1 text-sm font-semibold"
              >
                Payments received
              </h3>
              {current.payments.length === 0 ? (
                <p className="py-2 text-[13px] text-fg-muted">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {current.payments.map((payment) => {
                    const refundable = payment.amountMinor - refundedOf(payment);
                    return (
                      <li key={payment.id} className="py-2.5">
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                          <div className="min-w-0">
                            <span className="font-medium">{humanize(payment.method)}</span>
                            <span className="tabular ml-2 font-mono text-[12px] text-fg-muted">
                              {formatDate(payment.createdAt)}
                              {payment.reference ? ` · ${payment.reference}` : ''}
                            </span>
                          </div>
                          <span className="tabular shrink-0 font-mono font-medium">
                            {formatMoney(payment.amountMinor)}
                          </span>
                        </div>
                        {payment.refunds.map((refund) => (
                          <div
                            key={refund.id}
                            className="mt-1 flex items-baseline justify-between gap-3 text-[12px] text-fg-muted"
                          >
                            <span className="min-w-0">
                              Refunded {formatDate(refund.createdAt)}: {refund.reason}
                            </span>
                            <span className="tabular shrink-0 font-mono text-danger-fg">
                              -{formatMoney(refund.amountMinor)}
                            </span>
                          </div>
                        ))}
                        {canRefund && refundable > 0 && (
                          <div className="mt-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<ArrowUUpLeft size={16} aria-hidden="true" />}
                              onClick={() => setAction({ kind: 'refund', payment })}
                            >
                              Refund
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </article>
        )}
      </Dialog>

      {current && action?.kind === 'pay' && (
        <RecordPaymentDialog
          invoiceId={current.id}
          number={current.number}
          balanceMinor={balance}
          onClose={() => setAction(undefined)}
          onDone={done}
        />
      )}
      {current && action?.kind === 'void' && (
        <VoidDialog
          invoiceId={current.id}
          number={current.number}
          paidMinor={current.paidMinor}
          onClose={() => setAction(undefined)}
          onDone={done}
        />
      )}
      {current && action?.kind === 'refund' && (
        <RefundDialog
          payment={action.payment}
          refundableMinor={action.payment.amountMinor - refundedOf(action.payment)}
          number={current.number}
          onClose={() => setAction(undefined)}
          onDone={done}
        />
      )}
    </>
  );
}
