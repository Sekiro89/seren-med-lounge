'use client';

import { useState } from 'react';
import { insuranceTransitionSchema, settleInsuranceCaseSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney, fullName } from '../../../../lib/format';
import {
  focusFirst,
  invalidProps,
  isClean,
  req,
  requiredProps,
  type FieldErrors,
  clearOnEdit,
  makeClearError,
} from '../../../../lib/forms';
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));
  const [busy, setBusy] = useState(false);

  const close = () => {
    setAmount('');
    setReference('');
    setNote('');
    setError(undefined);
    setErrors({});
    onClose();
  };

  const submit = async () => {
    if (!step || busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    let amountMinor: number | undefined;
    if (step.needsAmount) {
      const rupees = Number(amount);
      if (amount.trim() === '') next['step-amount'] = 'Enter the approved amount in rupees.';
      else if (!Number.isFinite(rupees) || rupees < 0) {
        next['step-amount'] = 'Enter an amount of zero or more.';
      } else if (rupees * 100 > 1_000_000_000_000)
        next['step-amount'] = 'That amount is too large.';
      else amountMinor = rupeesToPaise(rupees);
    }
    if (reference.trim().length > 100) next['step-reference'] = 'Use 100 characters or fewer.';
    if (note.trim().length > 4000) next['step-note'] = 'Use 4000 characters or fewer.';
    setErrors(next);
    if (!isClean(next)) return focusFirst(next, ['step-amount', 'step-reference', 'step-note']);
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
        onChange={clearOnEdit(clearError)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {step?.needsAmount && (
          <Field
            label={req('Approved amount in rupees')}
            htmlFor="step-amount"
            error={errors['step-amount']}
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
              {...requiredProps}
              {...invalidProps(errors['step-amount'])}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        )}
        {step?.reference && (
          <Field
            label={`${step.reference} (optional)`}
            htmlFor="step-reference"
            error={errors['step-reference']}
          >
            <Input
              id="step-reference"
              {...invalidProps(errors['step-reference'])}
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
          error={errors['step-note']}
        >
          <Textarea
            id="step-note"
            {...invalidProps(errors['step-note'])}
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));
  const [busy, setBusy] = useState(false);

  const close = () => {
    setAmount('');
    setReference('');
    setError(undefined);
    setErrors({});
    onClose();
  };

  const submit = async () => {
    if (busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    const rupees = amount.trim() === '' ? cap / 100 : Number(amount);
    const amountMinor = Number.isFinite(rupees) ? rupeesToPaise(rupees) : 0;
    if (!Number.isFinite(rupees) || amountMinor <= 0) {
      next['settle-amount'] = 'Enter the amount the insurer paid, more than zero.';
    } else if (amountMinor > cap) {
      next['settle-amount'] = `The amount cannot be more than the approved ${formatMoney(cap)}.`;
    }
    if (reference.trim().length > 100) next['settle-reference'] = 'Use 100 characters or fewer.';
    setErrors(next);
    if (!isClean(next)) return focusFirst(next, ['settle-amount', 'settle-reference']);
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
        onChange={clearOnEdit(clearError)}
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
          label={req('Amount received in rupees')}
          htmlFor="settle-amount"
          error={errors['settle-amount']}
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
            {...requiredProps}
            {...invalidProps(errors['settle-amount'])}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field
          label="Payment reference (optional)"
          htmlFor="settle-reference"
          error={errors['settle-reference']}
        >
          <Input
            id="settle-reference"
            {...invalidProps(errors['settle-reference'])}
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
