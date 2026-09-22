'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPrescriptionSchema, type CreatePrescriptionInput } from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Button, Card } from '@serenemed/ui';
import { apiClient } from '../../../lib/api-client';
import { can } from '../../../lib/permissions';
import { apiErrorMessage, type Prescription } from './types';

const EMPTY_ITEM = { medicationName: '', dosage: '', frequency: '' };

export function PrescriptionsSection({
  encounterId,
  prescriptions,
  role,
  onChange,
}: {
  encounterId: string;
  prescriptions: Prescription[];
  role: StaffRole | undefined;
  onChange: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { register, control, handleSubmit, reset, formState } = useForm<CreatePrescriptionInput>({
    resolver: zodResolver(createPrescriptionSchema),
    defaultValues: { encounterId, items: [EMPTY_ITEM] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const onSubmit = async (data: CreatePrescriptionInput) => {
    setFormError(null);
    try {
      await apiClient.post('/prescriptions', { ...data, encounterId });
      reset({ encounterId, items: [EMPTY_ITEM] });
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not issue the prescription.'));
    }
  };

  const cancelPrescription = async (id: string) => {
    setCancellingId(id);
    setFormError(null);
    try {
      await apiClient.post(`/prescriptions/${id}/cancel`);
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not cancel this prescription.'));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Prescriptions</h2>
      {prescriptions.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No prescriptions yet.</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {prescriptions.map((prescription) => (
            <li key={prescription.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                  {prescription.status}
                </span>
                {prescription.status === 'ACTIVE' && can(role, 'prescription:write') && (
                  <Button
                    variant="danger"
                    onClick={() => cancelPrescription(prescription.id)}
                    disabled={cancellingId === prescription.id}
                  >
                    {cancellingId === prescription.id ? 'Cancelling…' : 'Cancel'}
                  </Button>
                )}
              </div>
              <ul className="flex flex-col gap-1 text-slate-700">
                {prescription.items.map((item) => (
                  <li key={item.id}>
                    {item.medicationName} — {item.dosage}, {item.frequency}
                    {item.durationDays ? ` for ${item.durationDays}d` : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {can(role, 'prescription:write') && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-end gap-2">
              <input
                placeholder="Medication"
                className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
                {...register(`items.${index}.medicationName`)}
              />
              <input
                placeholder="Dosage (e.g. 500mg)"
                className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
                {...register(`items.${index}.dosage`)}
              />
              <input
                placeholder="Frequency (e.g. Twice daily)"
                className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
                {...register(`items.${index}.frequency`)}
              />
              <input
                type="number"
                placeholder="Days"
                className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                {...register(`items.${index}.durationDays`, {
                  // Same NaN-vs-undefined bug as vitals-section.tsx —
                  // valueAsNumber turns an empty "Days" field into NaN,
                  // which fails Zod's optional numeric validation and
                  // silently blocks the whole submission (no request
                  // ever sent). Caught live in a browser, not typecheck.
                  setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
                })}
              />
              {fields.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => remove(index)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => append(EMPTY_ITEM)}
          >
            + Add another medication
          </Button>
          {formState.errors.items && (
            <p className="text-xs text-red-600">Check the medication fields above.</p>
          )}
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <Button type="submit" disabled={formState.isSubmitting} className="self-start">
            {formState.isSubmitting ? 'Issuing…' : 'Issue prescription'}
          </Button>
        </form>
      )}
    </Card>
  );
}
