'use client';

import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Plus, Trash } from '@phosphor-icons/react';
import { createInvoiceSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney } from '../../../../lib/format';
import { clearOnEditRhf } from '../../../../lib/forms';
import { errorText, rupeesToPaise, type InvoiceDetail } from './billing-types';
import { PatientPicker, type PatientOption } from './patient-picker';

const ITEM_TYPES = [
  ['CONSULTATION', 'Consultation'],
  ['PROCEDURE', 'Procedure'],
  ['LAB', 'Lab'],
  ['PHARMACY', 'Pharmacy'],
  ['OTHER', 'Other'],
] as const;

interface ItemValues {
  itemType: (typeof ITEM_TYPES)[number][0];
  description: string;
  quantity: string;
  unitPrice: string;
  tax: string;
}

interface FormValues {
  patient: PatientOption | null;
  items: ItemValues[];
  notes: string;
}

/** The schema caps an amount at 1,000,000,000 paise. */
const MAX_RUPEES = 10_000_000;

/** Returns an error message, or undefined when the amount is acceptable. */
function validMoney(value: string, requiredField: boolean): string | undefined {
  if (value === '') return requiredField ? 'Enter a price.' : undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 'Enter an amount of 0 or more.';
  if (amount > MAX_RUPEES) return 'Amount is too large.';
  return undefined;
}

const blankItem = (): ItemValues => ({
  itemType: 'CONSULTATION',
  description: '',
  quantity: '1',
  unitPrice: '',
  tax: '',
});

/** Same arithmetic as InvoicesService.issue: line = qty * unit + tax. */
function lineTotalPaise(item: ItemValues): number {
  const qty = Number(item.quantity) || 0;
  return qty * rupeesToPaise(Number(item.unitPrice) || 0) + rupeesToPaise(Number(item.tax) || 0);
}

export function NewInvoiceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: InvoiceDetail, patient: PatientOption) => void;
}) {
  const [serverError, setServerError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<FormValues>({
    reValidateMode: 'onSubmit',
    defaultValues: { patient: null, items: [blankItem()], notes: '' },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control, name: 'items' });
  const total = (watched ?? []).reduce((sum, item) => sum + lineTotalPaise(item), 0);

  const close = () => {
    reset({ patient: null, items: [blankItem()], notes: '' });
    setServerError(undefined);
    onClose();
  };

  const submit = handleSubmit(async (values) => {
    // Enter key and the footer button share this handler; never send twice.
    if (submitting) return;
    setServerError(undefined);
    if (!values.patient) {
      setError('patient', { message: 'Choose a patient.' });
      return;
    }
    const parsed = createInvoiceSchema.safeParse({
      patientId: values.patient.id,
      items: values.items.map((item) => ({
        itemType: item.itemType,
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unitPriceMinor: rupeesToPaise(Number(item.unitPrice) || 0),
        ...(item.tax ? { taxMinor: rupeesToPaise(Number(item.tax) || 0) } : {}),
      })),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    });
    if (!parsed.success) {
      setServerError('Check the line items: each needs a description and a whole-number quantity.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiClient.post<InvoiceDetail>('/invoices', parsed.data);
      const patient = values.patient;
      reset({ patient: null, items: [blankItem()], notes: '' });
      onCreated(created, patient);
    } catch (e) {
      setServerError(errorText(e, 'The invoice was not created. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New invoice"
      description="Invoices cannot be edited once issued. A wrong invoice is voided and reissued."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" loading={submitting} onClick={submit}>
            Issue invoice
          </Button>
        </>
      }
    >
      <form
        onSubmit={submit}
        onChange={clearOnEditRhf(clearErrors, () => setServerError(undefined))}
        className="space-y-5"
        noValidate
      >
        <Controller
          control={control}
          name="patient"
          rules={{ validate: (value) => value !== null || 'Choose a patient.' }}
          render={({ field }) => (
            <PatientPicker
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                clearErrors('patient');
                setServerError(undefined);
              }}
              error={errors.patient?.message}
            />
          )}
        />

        <div className="space-y-3">
          <p className="text-sm font-medium">Line items</p>
          {fields.map((field, index) => {
            const itemErrors = errors.items?.[index];
            return (
              <div
                key={field.id}
                className="space-y-3 rounded-control border border-line bg-surface-muted p-3"
              >
                <div className="grid grid-cols-[10rem_1fr] gap-3">
                  <Field label="Type" htmlFor={`item-type-${index}`}>
                    <Select id={`item-type-${index}`} {...register(`items.${index}.itemType`)}>
                      {ITEM_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Description"
                    htmlFor={`item-desc-${index}`}
                    error={itemErrors?.description?.message}
                  >
                    <Input
                      id={`item-desc-${index}`}
                      maxLength={300}
                      required
                      aria-required="true"
                      aria-invalid={itemErrors?.description ? true : undefined}
                      {...register(`items.${index}.description`, {
                        validate: (v) => v.trim().length > 0 || 'Describe this line.',
                      })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field
                    label="Quantity"
                    htmlFor={`item-qty-${index}`}
                    error={itemErrors?.quantity?.message}
                  >
                    <Input
                      id={`item-qty-${index}`}
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      required
                      aria-required="true"
                      aria-invalid={itemErrors?.quantity ? true : undefined}
                      inputMode="numeric"
                      className="tabular font-mono text-right"
                      {...register(`items.${index}.quantity`, {
                        validate: (v) =>
                          (v !== '' &&
                            Number.isInteger(Number(v)) &&
                            Number(v) >= 1 &&
                            Number(v) <= 10000) ||
                          'Whole number from 1 to 10,000.',
                      })}
                    />
                  </Field>
                  <Field
                    label="Unit price (INR)"
                    htmlFor={`item-price-${index}`}
                    error={itemErrors?.unitPrice?.message}
                  >
                    <Input
                      id={`item-price-${index}`}
                      type="number"
                      min={0}
                      max={MAX_RUPEES}
                      step="0.01"
                      inputMode="decimal"
                      required
                      aria-required="true"
                      aria-invalid={itemErrors?.unitPrice ? true : undefined}
                      className="tabular font-mono text-right"
                      {...register(`items.${index}.unitPrice`, {
                        validate: (v) => validMoney(v, true) ?? true,
                      })}
                    />
                  </Field>
                  <Field
                    label="Tax (INR, optional)"
                    htmlFor={`item-tax-${index}`}
                    error={itemErrors?.tax?.message}
                  >
                    <Input
                      id={`item-tax-${index}`}
                      type="number"
                      aria-invalid={itemErrors?.tax ? true : undefined}
                      min={0}
                      max={MAX_RUPEES}
                      step="0.01"
                      inputMode="decimal"
                      className="tabular font-mono text-right"
                      {...register(`items.${index}.tax`, {
                        validate: (v) => validMoney(v, false) ?? true,
                      })}
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-between">
                  <p className="tabular font-mono text-[13px] text-fg-muted">
                    Line total{' '}
                    <span className="font-mono font-medium text-fg">
                      {formatMoney(lineTotalPaise(watched?.[index] ?? field))}
                    </span>
                  </p>
                  {fields.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash size={16} aria-hidden="true" />}
                      onClick={() => remove(index)}
                    >
                      Remove line
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => append(blankItem())}
          >
            Add line
          </Button>
        </div>

        <Field label="Notes (optional)" htmlFor="invoice-notes">
          <Textarea id="invoice-notes" maxLength={1000} {...register('notes')} />
        </Field>

        <div className="flex items-center justify-between rounded-control bg-primary-subtle px-4 py-3">
          <span className="text-sm font-medium text-primary-subtle-fg">Invoice total</span>
          <span className="tabular font-mono text-lg font-semibold text-primary-subtle-fg">
            {formatMoney(total)}
          </span>
        </div>

        {serverError && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {serverError}
          </p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>
          Issue invoice
        </button>
      </form>
    </Dialog>
  );
}
