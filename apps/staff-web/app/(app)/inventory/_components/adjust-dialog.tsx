'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { adjustStockSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { FormError, medicineLabel, serverMessage, type BatchRow } from './shared';

interface Values {
  type: 'ADJUSTMENT' | 'WASTAGE';
  quantityDelta: string;
  reason: string;
}

const EMPTY: Values = { type: 'ADJUSTMENT', quantityDelta: '', reason: '' };

export function AdjustDialog({
  batch,
  onClose,
  onDone,
}: {
  batch: BatchRow | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const { register, handleSubmit, setError, control, formState } = useForm<Values>({
    defaultValues: EMPTY,
  });
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const { errors } = formState;
  const type = useWatch({ control, name: 'type' });

  const submit = handleSubmit(async (v) => {
    if (!batch) return;
    setServerError(undefined);
    const parsed = adjustStockSchema.safeParse({
      type: v.type,
      quantityDelta: v.quantityDelta.trim() === '' ? undefined : Number(v.quantityDelta),
      reason: v.reason.trim(),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        const key = (path ? String(path) : 'quantityDelta') as keyof Values;
        const message =
          path === 'reason'
            ? 'Say why the stock changed.'
            : path === 'quantityDelta' && issue.code !== 'custom'
              ? 'Enter a whole number, such as -5 or 3.'
              : issue.message.includes('WASTAGE')
                ? 'Wastage removes stock, so enter a negative number such as -5.'
                : 'The change cannot be 0.';
        setError(key, { message });
      }
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/stock/batches/${batch.id}/adjust`, parsed.data);
      onDone();
      onClose();
    } catch (e) {
      setServerError(serverMessage(e, 'The adjustment was not saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  });

  return (
    <Dialog
      open={batch !== undefined}
      onClose={onClose}
      title="Adjust stock"
      description={
        batch
          ? `${medicineLabel(batch.medication)}, batch ${batch.batchNumber}. ${batch.quantityOnHand} on hand.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-stock-form" loading={busy}>
            Save adjustment
          </Button>
        </>
      }
    >
      <form id="adjust-stock-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={serverError} />
        <Field label="Type" htmlFor="adj-type">
          <Select id="adj-type" {...register('type')}>
            <option value="ADJUSTMENT">Stock count correction</option>
            <option value="WASTAGE">Wastage (expired or damaged)</option>
          </Select>
        </Field>
        <Field
          label="Change in units"
          htmlFor="adj-qty"
          helper={
            type === 'WASTAGE'
              ? 'Wastage always removes stock. Enter a negative number, such as -5.'
              : 'Use a negative number to remove units (-5) and a positive number to add them (3).'
          }
          error={errors.quantityDelta?.message}
        >
          <Input id="adj-qty" inputMode="numeric" {...register('quantityDelta')} />
        </Field>
        <Field label="Reason" htmlFor="adj-reason" error={errors.reason?.message}>
          <Textarea id="adj-reason" {...register('reason')} />
        </Field>
      </form>
    </Dialog>
  );
}
