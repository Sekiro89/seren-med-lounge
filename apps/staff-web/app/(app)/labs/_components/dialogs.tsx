'use client';

import { useState, type FormEvent } from 'react';
import { recordLabResultSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, fullName } from '../../../../lib/format';
import { messageOf, type LabItemRow, type LabOrderRow } from './types';

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

export function describeResult(r: { resultValue: string; unit: string | null }): string {
  return r.unit ? `${r.resultValue} ${r.unit}` : r.resultValue;
}

export function EnterResultDialog(props: {
  item: LabItemRow | undefined;
  order: LabOrderRow | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { item, order } = props;
  return (
    <Dialog
      open={Boolean(item)}
      onClose={props.onClose}
      title={item ? `Enter result: ${item.testName}` : 'Enter result'}
      description={order ? fullName(order.patient) : undefined}
    >
      {item && order && <ResultForm key={item.id} {...props} item={item} />}
    </Dialog>
  );
}

function ResultForm({
  item,
  onClose,
  onSaved,
}: {
  item: LabItemRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [range, setRange] = useState('');
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const parsed = recordLabResultSchema.safeParse({
      resultValue: value.trim(),
      unit: unit.trim() || undefined,
      referenceRange: range.trim() || undefined,
    });
    if (!parsed.success) {
      setFieldError(
        value.trim().length > 500
          ? 'Result can be at most 500 characters.'
          : 'Enter the result value.',
      );
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    try {
      await apiClient.post(`/lab-orders/items/${item.id}/results`, parsed.data);
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'The result could not be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {item.results.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-fg">Earlier entries</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {item.results.map((r, i) => (
              <li key={r.id} className="flex items-baseline justify-between gap-4 py-2">
                <span className="text-fg">
                  {describeResult(r)}
                  {i === 0 && <span className="ml-2 text-xs text-fg-subtle">Current</span>}
                </span>
                <span className="tabular font-mono text-[13px] text-fg-subtle">
                  {formatDate(r.createdAt)} {formatTime(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Field
        label="Result"
        htmlFor="lab-result-value"
        error={fieldError}
        helper="A new entry replaces the current result and the earlier ones stay on record for the audit trail."
      >
        <Input
          id="lab-result-value"
          value={value}
          maxLength={500}
          required
          aria-required="true"
          aria-invalid={fieldError ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (fieldError) setFieldError(undefined);
            setError(undefined);
          }}
          autoFocus
        />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Unit (optional)" htmlFor="lab-result-unit">
          <Input
            id="lab-result-unit"
            value={unit}
            maxLength={50}
            onChange={(e) => {
              setUnit(e.target.value);
              setError(undefined);
            }}
          />
        </Field>
        <Field label="Reference range (optional)" htmlFor="lab-result-range">
          <Input
            id="lab-result-range"
            value={range}
            maxLength={200}
            onChange={(e) => {
              setRange(e.target.value);
              setError(undefined);
            }}
          />
        </Field>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button type="submit" loading={busy}>
          {item.results.length > 0 ? 'Save corrected result' : 'Save result'}
        </Button>
      </div>
    </form>
  );
}

export function CancelOrderDialog(props: {
  order: LabOrderRow | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { order, onClose, onSaved } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const confirm = async () => {
    if (!order || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/lab-orders/${order.id}/cancel`);
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'The order could not be cancelled. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(order)}
      onClose={() => {
        setError(undefined);
        onClose();
      }}
      title="Cancel this lab order?"
      description={order ? fullName(order.patient) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep order
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            Cancel order
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">
          {order
            ? `The ${order.items.length === 1 ? 'test' : `${order.items.length} tests`} ordered for ${fullName(order.patient)} will no longer be processed. This cannot be undone.`
            : ''}
        </p>
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
