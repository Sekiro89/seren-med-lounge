'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createMedicationSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { humanize } from '../../../../lib/format';
import { invalidProps, req, requiredProps, clearOnEditRhf } from '../../../../lib/forms';
import { FormError, rupeesToPaise, serverMessage } from './shared';

const FORMS = ['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'INHALER', 'OTHER'];

interface Values {
  name: string;
  genericName: string;
  form: string;
  strength: string;
  unit: string;
  price: string;
  reorderLevel: string;
}

const EMPTY: Values = {
  name: '',
  genericName: '',
  form: 'TABLET',
  strength: '',
  unit: '',
  price: '',
  reorderLevel: '',
};

export function AddMedicineDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { register, handleSubmit, setError, clearErrors, formState } = useForm<Values>({
    defaultValues: EMPTY,
  });
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const { errors } = formState;

  const submit = handleSubmit(async (v) => {
    if (busy) return;
    setServerError(undefined);
    const price = rupeesToPaise(v.price);
    if (Number.isNaN(price)) {
      setError('price', { message: 'Enter a price in rupees, like 12.50.' });
      return;
    }
    const reorder = v.reorderLevel.trim() === '' ? undefined : Number(v.reorderLevel);
    const parsed = createMedicationSchema.safeParse({
      name: v.name.trim(),
      genericName: v.genericName.trim() || undefined,
      form: v.form,
      strength: v.strength.trim() || undefined,
      unit: v.unit.trim(),
      unitPriceMinor: price,
      reorderLevel: reorder,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'unitPriceMinor' ? 'price' : String(issue.path[0]);
        const message =
          issue.path[0] === 'name' || issue.path[0] === 'unit'
            ? v[issue.path[0]].trim()
              ? 'That is too long.'
              : 'This is required.'
            : issue.path[0] === 'reorderLevel'
              ? 'Enter a whole number from 0 to 1,000,000.'
              : issue.path[0] === 'unitPriceMinor'
                ? 'Enter a price between 0 and 10,00,000 rupees.'
                : issue.message;
        setError(key as keyof Values, { message });
      }
      return;
    }
    setBusy(true);
    try {
      await apiClient.post('/medications', parsed.data);
      onDone();
      onClose();
    } catch (e) {
      setServerError(serverMessage(e, 'The medicine was not saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add medicine"
      description="Adds it to the catalogue. Receive stock to put units on the shelf."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-medicine-form" loading={busy}>
            Add medicine
          </Button>
        </>
      }
    >
      <form
        id="add-medicine-form"
        onSubmit={submit}
        className="space-y-4"
        noValidate
        onChange={clearOnEditRhf(clearErrors, () => setServerError(undefined))}
      >
        <FormError message={serverError} />
        <Field label={req('Name')} htmlFor="med-name" error={errors.name?.message}>
          <Input
            id="med-name"
            maxLength={200}
            {...requiredProps}
            {...invalidProps(errors.name?.message)}
            {...register('name')}
          />
        </Field>
        <Field
          label="Generic name (optional)"
          htmlFor="med-generic"
          error={errors.genericName?.message}
        >
          <Input
            id="med-generic"
            maxLength={200}
            {...invalidProps(errors.genericName?.message)}
            {...register('genericName')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={req('Form')} htmlFor="med-form">
            <Select id="med-form" {...requiredProps} {...register('form')}>
              {FORMS.map((f) => (
                <option key={f} value={f}>
                  {humanize(f)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Strength (optional)"
            htmlFor="med-strength"
            error={errors.strength?.message}
          >
            <Input
              id="med-strength"
              maxLength={100}
              {...invalidProps(errors.strength?.message)}
              {...register('strength')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label={req('Unit')}
            htmlFor="med-unit"
            helper="How it is counted, such as tablet or bottle."
            error={errors.unit?.message}
          >
            <Input
              id="med-unit"
              maxLength={50}
              {...requiredProps}
              {...invalidProps(errors.unit?.message)}
              {...register('unit')}
            />
          </Field>
          <Field
            label="Price per unit, in rupees (optional)"
            htmlFor="med-price"
            error={errors.price?.message}
          >
            <Input
              id="med-price"
              inputMode="decimal"
              {...invalidProps(errors.price?.message)}
              {...register('price')}
            />
          </Field>
        </div>
        <Field
          label="Reorder level (optional)"
          htmlFor="med-reorder"
          helper="Flagged as low stock when usable units reach this number."
          error={errors.reorderLevel?.message}
        >
          <Input
            id="med-reorder"
            inputMode="numeric"
            {...invalidProps(errors.reorderLevel?.message)}
            {...register('reorderLevel')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
