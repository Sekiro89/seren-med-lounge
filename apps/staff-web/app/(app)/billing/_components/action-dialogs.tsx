'use client';

import { useState } from 'react';
import { issueRefundSchema, recordPaymentSchema, voidInvoiceSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney, humanize } from '../../../../lib/format';
import { errorText, invoiceLabel, rupeesToPaise, type PaymentRow } from './billing-types';

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

/** Runs one mutation with shared busy/error handling. */
function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export function RecordPaymentDialog({
  invoiceId,
  number,
  balanceMinor,
  onClose,
  onDone,
}: {
  invoiceId: string;
  number: number;
  balanceMinor: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState((balanceMinor / 100).toFixed(2));
  const [reference, setReference] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const { busy, error, run } = useAction(onDone);

  const submit = () => {
    const amountMinor = rupeesToPaise(Number(amount));
    if (!(amountMinor > 0)) return setFieldError('Enter an amount above zero.');
    if (amountMinor > balanceMinor) {
      return setFieldError(`Amount cannot exceed the balance of ${formatMoney(balanceMinor)}.`);
    }
    const parsed = recordPaymentSchema.safeParse({
      method,
      amountMinor,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    });
    if (!parsed.success) return setFieldError('Check the payment details.');
    setFieldError(undefined);
    void run(
      () => apiClient.post(`/invoices/${invoiceId}/payments`, parsed.data),
      'The payment was not recorded. Please try again.',
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record payment"
      description={`${invoiceLabel(number)}, balance ${formatMoney(balanceMinor)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Method" htmlFor="pay-method">
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
          </Select>
        </Field>
        <Field label="Amount (INR)" htmlFor="pay-amount" error={fieldError}>
          <Input
            id="pay-amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="tabular font-mono text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        {method !== 'CASH' && (
          <Field
            label="Reference (optional)"
            htmlFor="pay-ref"
            helper={
              method === 'UPI' ? 'UPI transaction id.' : 'Card slip number. Never the card number.'
            }
          >
            <Input
              id="pay-ref"
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        )}
        <ErrorLine message={error} />
      </div>
    </Dialog>
  );
}

export function RefundDialog({
  payment,
  refundableMinor,
  number,
  onClose,
  onDone,
}: {
  payment: PaymentRow;
  refundableMinor: number;
  number: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState((refundableMinor / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const { busy, error, run } = useAction(onDone);
  const amountMinor = rupeesToPaise(Number(amount));

  const submit = () => {
    if (!(amountMinor > 0)) return setFieldError('Enter an amount above zero.');
    if (amountMinor > refundableMinor) {
      return setFieldError(`Cannot exceed ${formatMoney(refundableMinor)} still refundable.`);
    }
    const parsed = issueRefundSchema.safeParse({ amountMinor, reason: reason.trim() });
    if (!parsed.success) return setFieldError('A reason is required.');
    setFieldError(undefined);
    void run(
      () => apiClient.post(`/payments/${payment.id}/refunds`, parsed.data),
      'The refund was not issued. Please try again.',
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Refund payment"
      description={`${humanize(payment.method)} payment of ${formatMoney(payment.amountMinor)} on ${invoiceLabel(number)}. A refund cannot be undone.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={submit}>
            Refund {amountMinor > 0 ? formatMoney(amountMinor) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Refund amount (INR)"
          htmlFor="refund-amount"
          error={fieldError?.includes('reason') ? undefined : fieldError}
          helper={`Up to ${formatMoney(refundableMinor)}.`}
        >
          <Input
            id="refund-amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="tabular font-mono text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field
          label="Reason"
          htmlFor="refund-reason"
          error={fieldError?.includes('reason') ? fieldError : undefined}
        >
          <Textarea
            id="refund-reason"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <ErrorLine message={error} />
      </div>
    </Dialog>
  );
}

export function VoidDialog({
  invoiceId,
  number,
  paidMinor,
  onClose,
  onDone,
}: {
  invoiceId: string;
  number: number;
  paidMinor: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const { busy, error, run } = useAction(onDone);

  const submit = () => {
    const parsed = voidInvoiceSchema.safeParse({ reason: reason.trim() });
    if (!parsed.success) return setFieldError('A reason is required.');
    setFieldError(undefined);
    void run(
      () => apiClient.post(`/invoices/${invoiceId}/void`, parsed.data),
      'The invoice was not voided. Please try again.',
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Void ${invoiceLabel(number)}`}
      description="A void invoice cannot be edited, paid or reopened. Issue a new invoice instead."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={submit}>
            Void invoice
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-control bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          {paidMinor > 0
            ? `${formatMoney(paidMinor)} has been paid on this invoice. Refund the payments first, otherwise voiding is refused.`
            : 'An invoice with payments can only be voided after those payments are refunded.'}
        </p>
        <Field label="Reason" htmlFor="void-reason" error={fieldError}>
          <Textarea
            id="void-reason"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <ErrorLine message={error} />
      </div>
    </Dialog>
  );
}
