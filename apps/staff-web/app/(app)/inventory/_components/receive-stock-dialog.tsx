'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { receiveStockSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { clinicToday } from '../../../../lib/format';
import { invalidProps, req, requiredProps } from '../../../../lib/forms';
import { FormError, medicineLabel, rupeesToPaise, serverMessage, type Medication } from './shared';

interface Values {
  medicationId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  unitCost: string;
  supplier: string;
}

const EMPTY: Values = {
  medicationId: '',
  batchNumber: '',
  expiryDate: '',
  quantity: '',
  unitCost: '',
  supplier: '',
};

export function ReceiveStockDialog({
  open,
  medications,
  initialMedicationId,
  onClose,
  onDone,
}: {
  open: boolean;
  medications: Medication[];
  initialMedicationId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    defaultValues: { ...EMPTY, medicationId: initialMedicationId ?? '' },
  });
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const { errors } = formState;
  const active = medications.filter((m) => m.isActive);

  const submit = handleSubmit(async (v) => {
    if (busy) return;
    setServerError(undefined);
    if (v.expiryDate && v.expiryDate < clinicToday()) {
      setError('expiryDate', {
        message: 'This date has already passed. Expired stock cannot be received.',
      });
      return;
    }
    const cost = rupeesToPaise(v.unitCost);
    if (Number.isNaN(cost)) {
      setError('unitCost', { message: 'Enter a cost in rupees, like 8.25.' });
      return;
    }
    const parsed = receiveStockSchema.safeParse({
      medicationId: v.medicationId,
      batchNumber: v.batchNumber.trim(),
      expiryDate: v.expiryDate,
      quantity: v.quantity.trim() === '' ? undefined : Number(v.quantity),
      unitCostMinor: cost,
      supplier: v.supplier.trim() || undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        const key = (path === 'unitCostMinor' ? 'unitCost' : String(path)) as keyof Values;
        const message =
          path === 'medicationId'
            ? 'Choose a medicine.'
            : path === 'batchNumber'
              ? 'Enter the batch number.'
              : path === 'expiryDate'
                ? 'Choose an expiry date.'
                : path === 'quantity'
                  ? 'Enter a whole number of units, from 1 to 1,000,000.'
                  : path === 'unitCostMinor'
                    ? 'Enter a cost between 0 and 10,00,000 rupees.'
                    : issue.message;
        setError(key, { message });
      }
      return;
    }
    setBusy(true);
    try {
      await apiClient.post('/stock/batches', parsed.data);
      onDone();
      onClose();
    } catch (e) {
      setServerError(serverMessage(e, 'The stock was not received. Please try again.'));
    } finally {
      setBusy(false);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Receive stock"
      description="Record a delivery as a new batch."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="receive-stock-form" loading={busy}>
            Receive stock
          </Button>
        </>
      }
    >
      <form id="receive-stock-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={serverError} />
        <Field label={req('Medicine')} htmlFor="rs-med" error={errors.medicationId?.message}>
          <Select
            id="rs-med"
            {...requiredProps}
            {...invalidProps(errors.medicationId?.message)}
            {...register('medicationId')}
          >
            <option value="">Choose a medicine</option>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {medicineLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={req('Batch number')} htmlFor="rs-batch" error={errors.batchNumber?.message}>
            <Input
              id="rs-batch"
              maxLength={100}
              {...requiredProps}
              {...invalidProps(errors.batchNumber?.message)}
              {...register('batchNumber')}
            />
          </Field>
          <Field label={req('Expiry date')} htmlFor="rs-expiry" error={errors.expiryDate?.message}>
            <Input
              id="rs-expiry"
              type="date"
              min={clinicToday()}
              {...requiredProps}
              {...invalidProps(errors.expiryDate?.message)}
              {...register('expiryDate')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={req('Quantity received')} htmlFor="rs-qty" error={errors.quantity?.message}>
            <Input
              id="rs-qty"
              inputMode="numeric"
              {...requiredProps}
              {...invalidProps(errors.quantity?.message)}
              {...register('quantity')}
            />
          </Field>
          <Field
            label="Cost per unit, in rupees (optional)"
            htmlFor="rs-cost"
            error={errors.unitCost?.message}
          >
            <Input
              id="rs-cost"
              inputMode="decimal"
              {...invalidProps(errors.unitCost?.message)}
              {...register('unitCost')}
            />
          </Field>
        </div>
        <Field label="Supplier (optional)" htmlFor="rs-supplier" error={errors.supplier?.message}>
          <Input
            id="rs-supplier"
            maxLength={200}
            {...invalidProps(errors.supplier?.message)}
            {...register('supplier')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
