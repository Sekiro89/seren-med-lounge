'use client';

import { useState } from 'react';
import { insuranceTransitionSchema, settleInsuranceCaseSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney, fullName } from '../../../../lib/format';
import {
  errorText,
  rupeesToPaise,
  STATUS_LABEL,
  type CaseDetail,
  type NextStep,
} from './insurance-types';

function ErrorLine({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {text}
    </p>
  );
}

/** Records one step the insurer has told staff about. */
export function TransitionDialog({
  detail,
  step,
  onClose,
  onDone,
}: {
  detail: CaseDetail;
  step: NextStep | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const close = () => {
    setAmount('');
    setReference('');
    setNote('');
    setError(undefined);
    onClose();
  };

  const submit = async () => {
    if (!step) return;
    setError(undefined);
    let amountMinor: number | undefined;
    if (step.needsAmount) {
      const rupees = Number(amount);
      if (amount.trim() === '' || !Number.isFinite(rupees) || rupees < 0) {
        setError('Enter the approved amount in rupees.');
        return;
      }
      amountMinor = rupeesToPaise(rupees);
    }
    const parsed = insuranceTransitionSchema.safeParse({
      toStatus: step.to,
      ...(amountMinor !== undefined ? { amountMinor } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (!parsed.success) {
      setError('Check the reference and note, then try again.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/insurance/cases/${detail.id}/transition`, parsed.data);
      close();
      onDone();
    } catch (e) {
      setError(errorText(e, 'The step was not recorded. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const target = step ? STATUS_LABEL[step.to] : '';
  return (
    <Dialog
      open={step !== null}
      onClose={close}
      title={step?.label ?? ''}
      description={`${fullName(detail.patient)}. The case moves to "${target}". Record what the insurer told you.`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {step?.label}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {step?.needsAmount && (
          <Field
            label="Approved amount in rupees"
            htmlFor="step-amount"
            helper={
              detail.requestedAmountMinor !== null
                ? `Requested ${formatMoney(detail.requestedAmountMinor)}.`
                : undefined
            }
          >
            <Input
              id="step-amount"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="tabular text-right"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        )}
        {step?.reference && (
          <Field label={`${step.reference} (optional)`} htmlFor="step-reference">
            <Input
              id="step-reference"
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        )}
        <Field
          label="Note (optional)"
          htmlFor="step-note"
          helper="Who you spoke to, or what the insurer said."
        >
          <Textarea
            id="step-note"
            maxLength={4000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <ErrorLine text={error} />
        <button type="submit" className="sr-only" tabIndex={-1}>
          Save
        </button>
      </form>
    </Dialog>
  );
}

/** Settlement posts an INSURANCE payment on the linked invoice. */
export function SettleDialog({
  detail,
  open,
  onClose,
  onDone,
}: {
  detail: CaseDetail;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const cap = detail.approvedAmountMinor ?? 0;
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const close = () => {
    setAmount('');
    setReference('');
    setError(undefined);
    onClose();
  };

  const submit = async () => {
    setError(undefined);
    const rupees = amount.trim() === '' ? cap / 100 : Number(amount);
    const amountMinor = rupeesToPaise(rupees);
    if (!Number.isFinite(rupees) || amountMinor <= 0) {
      setError('Enter the amount the insurer paid, more than zero.');
      return;
    }
    if (amountMinor > cap) {
      setError(`The amount cannot be more than the approved ${formatMoney(cap)}.`);
      return;
    }
    const parsed = settleInsuranceCaseSchema.safeParse({
      amountMinor,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    });
    if (!parsed.success) {
      setError('Check the amount and reference, then try again.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/insurance/cases/${detail.id}/settle`, parsed.data);
      close();
      onDone();
    } catch (e) {
      setError(errorText(e, 'The settlement was not recorded. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Settle case"
      description={fullName(detail.patient)}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Settle case
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-fg-muted">
          Settling records an insurance payment on the linked invoice and cannot be undone. The
          payment cannot be more than the approved amount of{' '}
          <span className="tabular font-medium text-fg">{formatMoney(cap)}</span>.
        </p>
        {!detail.invoiceId && (
          <p className="rounded-control bg-warning-bg px-3 py-2 text-sm text-warning-fg">
            This case has no linked invoice, so the server will not accept a settlement.
          </p>
        )}
        <Field
          label="Amount received in rupees"
          htmlFor="settle-amount"
          helper={`Leave blank to settle the full ${formatMoney(cap)}.`}
        >
          <Input
            id="settle-amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className="tabular text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Payment reference (optional)" htmlFor="settle-reference">
          <Input
            id="settle-reference"
            maxLength={100}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <ErrorLine text={error} />
        <button type="submit" className="sr-only" tabIndex={-1}>
          Settle case
        </button>
      </form>
    </Dialog>
  );
}
