'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash } from '@phosphor-icons/react';
import { createPrescriptionSchema, type CreatePrescriptionInput } from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { apiErrorMessage, orderTone, type Prescription } from './types';

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
  const [confirming, setConfirming] = useState<Prescription | null>(null);
  const [cancelling, setCancelling] = useState(false);

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

  const cancelPrescription = async (prescription: Prescription) => {
    setCancelling(true);
    setFormError(null);
    try {
      await apiClient.post(`/prescriptions/${prescription.id}/cancel`);
      setConfirming(null);
      onChange();
    } catch (error) {
      setConfirming(null);
      setFormError(apiErrorMessage(error, 'Could not cancel this prescription.'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Prescriptions" />
      <div className="p-5">
        {prescriptions.length === 0 ? (
          <p className="mb-4 text-sm text-fg-muted">No prescriptions yet.</p>
        ) : (
          <ul className="mb-5 flex flex-col gap-2">
            {prescriptions.map((prescription) => (
              <li
                key={prescription.id}
                className="rounded-control bg-surface-muted px-3 py-2 text-sm"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge tone={orderTone(prescription.status)}>
                    {humanize(prescription.status)}
                  </Badge>
                  {prescription.status === 'ACTIVE' && can(role, 'prescription:write') && (
                    <Button variant="danger" size="sm" onClick={() => setConfirming(prescription)}>
                      Cancel
                    </Button>
                  )}
                </div>
                <ul className="flex flex-col gap-1 text-fg">
                  {prescription.items.map((item) => (
                    <li key={item.id}>
                      <span className="font-medium">{item.medicationName}</span>
                      <span className="text-fg-muted">
                        {' '}
                        {item.dosage}, {item.frequency}
                        {item.durationDays ? ` for ${item.durationDays} days` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {can(role, 'prescription:write') && (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem] flex-1">
                  <Field label="Medication" htmlFor={`rx-med-${index}`}>
                    <Input id={`rx-med-${index}`} {...register(`items.${index}.medicationName`)} />
                  </Field>
                </div>
                <div className="w-36">
                  <Field label="Dosage" htmlFor={`rx-dose-${index}`} helper="For example 500mg">
                    <Input id={`rx-dose-${index}`} {...register(`items.${index}.dosage`)} />
                  </Field>
                </div>
                <div className="w-44">
                  <Field
                    label="Frequency"
                    htmlFor={`rx-freq-${index}`}
                    helper="For example twice daily"
                  >
                    <Input id={`rx-freq-${index}`} {...register(`items.${index}.frequency`)} />
                  </Field>
                </div>
                <div className="w-24">
                  <Field label="Days" htmlFor={`rx-days-${index}`}>
                    <Input
                      id={`rx-days-${index}`}
                      type="number"
                      {...register(`items.${index}.durationDays`, {
                        // Same NaN-vs-undefined issue as the vitals form:
                        // an empty number input must become undefined.
                        setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
                      })}
                    />
                  </Field>
                </div>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove medication ${index + 1}`}
                    icon={<Trash size={20} aria-hidden="true" />}
                    onClick={() => remove(index)}
                  />
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => append(EMPTY_ITEM)}
            >
              Add another medication
            </Button>
            {formState.errors.items && (
              <p role="alert" className="text-[13px] text-danger-fg">
                Check the medication fields above.
              </p>
            )}
            {formError && (
              <p role="alert" className="text-[13px] text-danger-fg">
                {formError}
              </p>
            )}
            <Button type="submit" loading={formState.isSubmitting} className="self-start">
              Issue prescription
            </Button>
          </form>
        )}
        {!can(role, 'prescription:write') && formError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-fg">
            {formError}
          </p>
        )}
      </div>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Cancel prescription"
        description={
          confirming
            ? `Issued ${formatDate(confirming.createdAt)}. This cannot be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Keep prescription
            </Button>
            <Button
              variant="danger"
              loading={cancelling}
              onClick={() => confirming && cancelPrescription(confirming)}
            >
              Cancel prescription
            </Button>
          </>
        }
      >
        <ul className="text-sm text-fg">
          {confirming?.items.map((item) => (
            <li key={item.id}>
              {item.medicationName} {item.dosage}
            </li>
          ))}
        </ul>
      </Dialog>
    </Card>
  );
}
