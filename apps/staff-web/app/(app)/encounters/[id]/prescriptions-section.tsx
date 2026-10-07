'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ShieldCheck, Trash, Warning } from '@phosphor-icons/react';
import { createPrescriptionSchema, type CreatePrescriptionInput } from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { LinkButton } from './document';
import { apiErrorMessage, orderTone, type Prescription } from './types';
import { clearKeysRhf, clearOnEditRhf } from '../../../../lib/forms';

const EMPTY_ITEM = { medicationName: '', dosage: '', frequency: '' };

/** Whitespace alone is not an entry, so trim before the schema sees it. */
const trimValue = (value: string) => (typeof value === 'string' ? value.trim() : value);

function itemErrorsOf(errors: unknown, index: number) {
  const list = (errors as { items?: unknown[] } | undefined)?.items;
  return list?.[index] as
    | Partial<Record<'medicationName' | 'dosage' | 'frequency' | 'durationDays', { type?: string }>>
    | undefined;
}

function textError(error: { type?: string } | undefined, label: string, max: number) {
  if (!error) return undefined;
  return error.type === 'too_big'
    ? `${label} can be at most ${max} characters.`
    : `Enter the ${label.toLowerCase()}.`;
}

/** The existing prescription form, opened from the rail's Add. */
function PrescriptionFormDialog({
  encounterId,
  onClose,
  onSaved,
}: {
  encounterId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, clearErrors, formState } =
    useForm<CreatePrescriptionInput>({
      resolver: zodResolver(createPrescriptionSchema),
      reValidateMode: 'onSubmit',
      defaultValues: { encounterId, items: [EMPTY_ITEM] },
    });
  // The "add at least one medication" error belongs to the whole list.
  const GROUP = ['items.root', 'items.message'] as const;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const onSubmit = async (data: CreatePrescriptionInput) => {
    if (formState.isSubmitting) return;
    setFormError(null);
    try {
      await apiClient.post('/prescriptions', { ...data, encounterId });
      reset({ encounterId, items: [EMPTY_ITEM] });
      onSaved();
      onClose();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not issue the prescription.'));
    }
  };

  return (
    <Dialog
      open
      onClose={() => !formState.isSubmitting && onClose()}
      title="Add prescription"
      description="Each medicine with its dose and how often. Days are optional."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="rx-form" loading={formState.isSubmitting}>
            Issue prescription
          </Button>
        </>
      }
    >
      <form
        id="rx-form"
        onSubmit={handleSubmit(onSubmit)}
        onChange={clearOnEditRhf(clearErrors, () => setFormError(null), { '*': [...GROUP] })}
        className="flex flex-col gap-4"
        noValidate
      >
        {fields.map((field, index) => {
          const itemErrors = itemErrorsOf(formState.errors, index);
          return (
            <div key={field.id} className="flex flex-wrap items-start gap-3">
              <div className="min-w-[10rem] flex-1">
                <Field
                  label="Medication"
                  htmlFor={`rx-med-${index}`}
                  error={textError(itemErrors?.medicationName, 'Medication', 200)}
                >
                  <Input
                    id={`rx-med-${index}`}
                    required
                    aria-required="true"
                    maxLength={200}
                    aria-invalid={itemErrors?.medicationName ? true : undefined}
                    {...register(`items.${index}.medicationName`, { setValueAs: trimValue })}
                  />
                </Field>
              </div>
              <div className="w-36">
                <Field
                  label="Dosage"
                  htmlFor={`rx-dose-${index}`}
                  helper="For example 500mg"
                  error={textError(itemErrors?.dosage, 'Dosage', 100)}
                >
                  <Input
                    id={`rx-dose-${index}`}
                    required
                    aria-required="true"
                    maxLength={100}
                    aria-invalid={itemErrors?.dosage ? true : undefined}
                    {...register(`items.${index}.dosage`, { setValueAs: trimValue })}
                  />
                </Field>
              </div>
              <div className="w-44">
                <Field
                  label="Frequency"
                  htmlFor={`rx-freq-${index}`}
                  helper="For example twice daily"
                  error={textError(itemErrors?.frequency, 'Frequency', 100)}
                >
                  <Input
                    id={`rx-freq-${index}`}
                    required
                    aria-required="true"
                    maxLength={100}
                    aria-invalid={itemErrors?.frequency ? true : undefined}
                    {...register(`items.${index}.frequency`, { setValueAs: trimValue })}
                  />
                </Field>
              </div>
              <div className="w-28">
                <Field
                  label="Days (optional)"
                  htmlFor={`rx-days-${index}`}
                  error={itemErrors?.durationDays ? 'Whole number from 1 to 365.' : undefined}
                >
                  <Input
                    id={`rx-days-${index}`}
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    inputMode="numeric"
                    aria-invalid={itemErrors?.durationDays ? true : undefined}
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
                  className="sm:mt-[1.625rem]"
                  aria-label={`Remove medication ${index + 1}`}
                  icon={<Trash size={20} aria-hidden="true" />}
                  onClick={() => {
                    remove(index);
                    clearKeysRhf(clearErrors, [...GROUP]);
                  }}
                />
              )}
            </div>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          icon={<Plus size={16} aria-hidden="true" />}
          onClick={() => {
            append(EMPTY_ITEM);
            clearKeysRhf(clearErrors, [...GROUP]);
          }}
        >
          Add another medication
        </Button>
        {(formState.errors.items?.message || formState.errors.items?.root?.message) && (
          <p role="alert" className="text-[13px] text-danger-fg">
            Add at least one medication.
          </p>
        )}
        {formError && (
          <p role="alert" className="text-[13px] text-danger-fg">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** Lower-cased allergy terms: "Penicillin (rash)" -> "penicillin". */
export function allergyTerms(allergies: { description: string }[]): string[] {
  return allergies
    .map(
      (a) =>
        a.description
          .replace(/\(.*?\)/g, '')
          .split(/[,;/]/)[0]
          ?.trim()
          .toLowerCase() ?? '',
    )
    .filter((t) => t.length >= 3);
}

/**
 * A plain name check: does any active medicine name contain a recorded
 * allergy term (case-insensitive substring)? It does not know drug
 * classes (amoxicillin vs penicillin), so the wording says "no match",
 * never "safe".
 */
function AllergyCheck({
  prescriptions,
  allergies,
}: {
  prescriptions: Prescription[];
  allergies: { description: string }[] | undefined;
}) {
  const names = prescriptions
    .filter((p) => p.status === 'ACTIVE')
    .flatMap((p) => p.items.map((i) => i.medicationName));
  if (names.length === 0 || allergies === undefined) return null;
  const terms = allergyTerms(allergies);
  if (terms.length === 0) {
    return <p className="mt-2 text-xs text-fg-muted">No allergies recorded to check against.</p>;
  }
  const hits = names.flatMap((name) =>
    terms.filter((t) => name.toLowerCase().includes(t)).map((t) => ({ name, term: t })),
  );
  if (hits.length > 0) {
    return (
      <p role="alert" className="mt-2 flex gap-1.5 bg-danger-bg px-2 py-1.5 text-xs text-danger-fg">
        <Warning size={16} className="shrink-0" aria-hidden="true" />
        <span>
          <b className="font-semibold">Allergy match</b> ·{' '}
          {hits.map((h) => `${h.name} matches the recorded allergy "${h.term}"`).join('; ')}
        </span>
      </p>
    );
  }
  return (
    <p className="mt-2 flex gap-1.5 text-xs text-success-fg">
      <ShieldCheck size={16} className="shrink-0" aria-hidden="true" />
      <span>
        <b className="font-semibold">No match against recorded allergies</b> · checked{' '}
        {terms.join(', ')} by name
      </span>
    </p>
  );
}

export function PrescriptionsRail({
  encounterId,
  prescriptions,
  role,
  allergies,
  onChange,
}: {
  encounterId: string;
  prescriptions: Prescription[];
  role: StaffRole | undefined;
  /** Active allergies; undefined while unknown (no check is shown). */
  allergies: { description: string }[] | undefined;
  onChange: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<Prescription | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const canWrite = can(role, 'prescription:write');

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
    <section aria-labelledby="rail-rx">
      <div className="section-rule flex min-h-10 items-center justify-between pt-1">
        <h2 id="rail-rx" className="text-sm font-semibold text-fg">
          Prescription
        </h2>
        {canWrite && (
          <LinkButton icon={<Plus size={14} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Add
          </LinkButton>
        )}
      </div>
      {prescriptions.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">No medicines prescribed on this visit.</p>
      ) : (
        <ul className="divide-y divide-line border-b border-line">
          {prescriptions.map((prescription) => {
            const cancelled = prescription.status === 'CANCELLED';
            return (
              <li key={prescription.id} className="py-2 text-[13px]">
                {prescription.items.map((item) => (
                  <div key={item.id} className={cancelled ? 'text-fg-subtle' : ''}>
                    <p className={`font-medium ${cancelled ? 'line-through' : 'text-fg'}`}>
                      {item.medicationName} {item.dosage}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {item.frequency}
                      {item.durationDays ? (
                        <>
                          {' · '}
                          <span className="font-mono">{item.durationDays}</span> days
                        </>
                      ) : null}
                      {item.instructions ? ` · ${item.instructions}` : ''}
                    </p>
                  </div>
                ))}
                {(prescription.status !== 'ACTIVE' ||
                  (prescription.status === 'ACTIVE' && canWrite)) && (
                  <div className="mt-1 flex items-center gap-2">
                    {prescription.status !== 'ACTIVE' && (
                      <Badge tone={orderTone(prescription.status)}>
                        {humanize(prescription.status)}
                      </Badge>
                    )}
                    {prescription.status === 'ACTIVE' && canWrite && (
                      <LinkButton tone="danger" small onClick={() => setConfirming(prescription)}>
                        Cancel prescription
                      </LinkButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AllergyCheck prescriptions={prescriptions} allergies={allergies} />
      {formError && (
        <p role="alert" className="mt-2 text-[13px] text-danger-fg">
          {formError}
        </p>
      )}

      {adding && (
        <PrescriptionFormDialog
          encounterId={encounterId}
          onClose={() => setAdding(false)}
          onSaved={onChange}
        />
      )}
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
    </section>
  );
}
