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
  } = useForm<FormValues>({ defaultValues: { patient: null, items: [blankItem()], notes: '' } });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control, name: 'items' });
  const total = (watched ?? []).reduce((sum, item) => sum + lineTotalPaise(item), 0);

  const close = () => {
    reset({ patient: null, items: [blankItem()], notes: '' });
    setServerError(undefined);
    onClose();
  };

  const submit = handleSubmit(async (values) => {
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
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={submit}>
            Issue invoice
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Controller
          control={control}
          name="patient"
          render={({ field }) => (
            <PatientPicker
              value={field.value}
              onChange={field.onChange}
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
                      step={1}
                      inputMode="numeric"
                      className="tabular text-right"
                      {...register(`items.${index}.quantity`, {
                        validate: (v) =>
                          (Number.isInteger(Number(v)) && Number(v) > 0) ||
                          'Whole number, 1 or more.',
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
                      step="0.01"
                      inputMode="decimal"
                      className="tabular text-right"
                      {...register(`items.${index}.unitPrice`, {
                        validate: (v) => (v !== '' && Number(v) >= 0) || 'Enter a price.',
                      })}
                    />
                  </Field>
                  <Field label="Tax (INR)" htmlFor={`item-tax-${index}`}>
                    <Input
                      id={`item-tax-${index}`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      className="tabular text-right"
                      {...register(`items.${index}.tax`)}
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-between">
                  <p className="tabular text-[13px] text-fg-muted">
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
