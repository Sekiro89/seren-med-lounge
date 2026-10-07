'use client';

import { useState } from 'react';
import { ArrowUUpLeft, CreditCard, Prohibit } from '@phosphor-icons/react';
import { StatusBadge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
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
        title={current ? invoiceLabel(current.number) : 'Invoice'}
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
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <StatusBadge domain="invoice" status={current.status} />
              <span className="text-[13px] text-fg-muted">
                Issued {formatDate(current.createdAt)}
              </span>
            </div>

            {current.status === 'VOID' && (
              <p className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                Voided{current.voidedAt ? ` on ${formatDate(current.voidedAt)}` : ''}
                {current.voidReason ? `: ${current.voidReason}` : '.'}
              </p>
            )}

            <section aria-labelledby="items-h">
              <h3 id="items-h" className="mb-2 text-sm font-semibold">
                Items
              </h3>
              <div className="overflow-x-auto rounded-control border border-line">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Item
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Qty
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Unit
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Tax
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.items.map((item) => (
                      <tr key={item.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.description}</p>
                          <p className="text-fg-subtle">{humanize(item.itemType)}</p>
                        </td>
                        <td className="tabular font-mono px-3 py-2 text-right">{item.quantity}</td>
                        <td className="tabular font-mono px-3 py-2 text-right">
                          {formatMoney(item.unitPriceMinor)}
                        </td>
                        <td className="tabular font-mono px-3 py-2 text-right">
                          {formatMoney(item.taxMinor)}
                        </td>
                        <td className="tabular font-mono px-3 py-2 text-right font-medium">
                          {formatMoney(item.lineTotalMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="tabular font-mono mt-3 space-y-1 text-sm">
                {(
                  [
                    ['Subtotal', current.subtotalMinor],
                    ['Tax', current.taxMinor],
                    ['Total', current.totalMinor],
                    ['Paid', current.paidMinor],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-fg-muted">{label}</dt>
                    <dd className="font-mono">{formatMoney(value)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line pt-2 font-semibold">
                  <dt>Balance</dt>
                  <dd className="font-mono">
                    {formatMoney(current.status === 'VOID' ? 0 : balance)}
                  </dd>
                </div>
              </dl>
              {current.notes && <p className="mt-3 text-[13px] text-fg-muted">{current.notes}</p>}
            </section>

            <section aria-labelledby="pay-h">
              <h3 id="pay-h" className="mb-2 text-sm font-semibold">
                Payments
              </h3>
              {current.payments.length === 0 ? (
                <p className="text-sm text-fg-muted">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-control border border-line">
                  {current.payments.map((payment) => {
                    const refundable = payment.amountMinor - refundedOf(payment);
                    return (
                      <li key={payment.id} className="px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{humanize(payment.method)}</p>
                            <p className="text-[13px] text-fg-muted">
                              {formatDate(payment.createdAt)}
                              {payment.reference ? ` / ${payment.reference}` : ''}
                            </p>
                          </div>
                          <p className="tabular font-mono text-sm font-medium">
                            {formatMoney(payment.amountMinor)}
                          </p>
                        </div>
                        {payment.refunds.map((refund) => (
                          <p key={refund.id} className="mt-2 text-[13px] text-fg-muted">
                            <span className="tabular font-mono text-danger-fg">
                              Refunded {formatMoney(refund.amountMinor)}
                            </span>{' '}
                            on {formatDate(refund.createdAt)}: {refund.reason}
                          </p>
                        ))}
                        {canRefund && refundable > 0 && (
                          <div className="mt-2">
                            <Button
                              size="sm"
                              variant="secondary"
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
          </div>
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
