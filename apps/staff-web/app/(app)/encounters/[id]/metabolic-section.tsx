'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from '@phosphor-icons/react';
import {
  recordMetabolicWorkupSchema,
  type RecordMetabolicWorkupInput,
} from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { clearOnEditRhf } from '../../../../lib/forms';
import { formatDate, formatTime, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { apiErrorMessage, type MetabolicWorkup } from './types';

type NumberKey = Exclude<
  keyof RecordMetabolicWorkupInput,
  'encounterId' | 'glucoseContext' | 'otherTests'
>;

interface NumberField {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  step?: string;
}

// min and max mirror recordMetabolicWorkupSchema so the browser and the schema agree.
const GROUPS: { title: string; fields: NumberField[] }[] = [
  {
    title: 'Blood sugar',
    fields: [
      { key: 'glucoseMgDl', label: 'Glucose (mg/dL)', min: 10, max: 1000 },
      { key: 'hba1cPercent', label: 'HbA1c (%)', min: 2, max: 20, step: '0.1' },
    ],
  },
  {
    title: 'Lipids',
    fields: [
      { key: 'totalCholesterolMgDl', label: 'Total cholesterol (mg/dL)', min: 20, max: 1000 },
      { key: 'ldlMgDl', label: 'LDL (mg/dL)', min: 5, max: 1000 },
      { key: 'hdlMgDl', label: 'HDL (mg/dL)', min: 5, max: 300 },
      { key: 'triglyceridesMgDl', label: 'Triglycerides (mg/dL)', min: 10, max: 5000 },
    ],
  },
  {
    title: 'Body composition',
    fields: [
      { key: 'bodyFatPercent', label: 'Body fat (%)', min: 1, max: 80, step: '0.1' },
      { key: 'muscleMassKg', label: 'Muscle mass (kg)', min: 1, max: 200, step: '0.1' },
      { key: 'visceralFatLevel', label: 'Visceral fat level', min: 0, max: 60 },
    ],
  },
];

const GLUCOSE_CONTEXTS = ['FASTING', 'RANDOM', 'POST_PRANDIAL'] as const;

function rangeMessage(label: string, min: number, max: number): string {
  return `${label}: enter a number from ${min} to ${max}.`;
}

function summarize(w: MetabolicWorkup): string {
  return [
    w.glucoseMgDl != null &&
      `Glucose ${w.glucoseMgDl} mg/dL${w.glucoseContext ? ` (${humanize(w.glucoseContext).toLowerCase()})` : ''}`,
    w.hba1cPercent != null && `HbA1c ${w.hba1cPercent}%`,
    w.totalCholesterolMgDl != null && `Total cholesterol ${w.totalCholesterolMgDl}`,
    w.ldlMgDl != null && `LDL ${w.ldlMgDl}`,
    w.hdlMgDl != null && `HDL ${w.hdlMgDl}`,
    w.triglyceridesMgDl != null && `Triglycerides ${w.triglyceridesMgDl}`,
    w.bodyFatPercent != null && `Body fat ${w.bodyFatPercent}%`,
    w.muscleMassKg != null && `Muscle mass ${w.muscleMassKg} kg`,
    w.visceralFatLevel != null && `Visceral fat ${w.visceralFatLevel}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Mounted only while open, so the form starts empty every time. */
function RecordWorkupDialog({
  encounterId,
  onClose,
  onSaved,
}: {
  encounterId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, clearErrors, setError, formState } =
    useForm<RecordMetabolicWorkupInput>({
      resolver: zodResolver(recordMetabolicWorkupSchema),
      reValidateMode: 'onSubmit',
      defaultValues: { encounterId },
    });

  const onSubmit = async (data: RecordMetabolicWorkupInput) => {
    // The schema only says "context needs a glucose reading"; a glucose
    // reading without its context is meaningless clinically, so ask for it.
    if (data.glucoseMgDl !== undefined && !data.glucoseContext) {
      setError('glucoseContext', { type: 'required' });
      return;
    }
    setFormError(null);
    try {
      await apiClient.post('/metabolic-workups', { ...data, encounterId });
      onSaved();
      onClose();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not record the workup.'));
    }
  };

  // The "at least one reading" rule belongs to the whole form (Zod path '').
  const groupError = (formState.errors as Record<string, { message?: string } | undefined>)['']
    ?.message;
  const busy = formState.isSubmitting;

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Record workup"
      description="Enter the readings you have. Leave the others blank."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="metabolic-form" loading={busy}>
            Record workup
          </Button>
        </>
      }
    >
      <form
        id="metabolic-form"
        onSubmit={handleSubmit(onSubmit)}
        onChange={clearOnEditRhf(clearErrors, () => setFormError(null), { '*': [''] })}
        className="flex flex-col gap-6"
        noValidate
      >
        {GROUPS.map((group) => (
          <fieldset key={group.title}>
            <legend className="mb-3 text-sm font-semibold text-fg">{group.title}</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {group.fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  htmlFor={`metabolic-${field.key}`}
                  error={
                    formState.errors[field.key]
                      ? rangeMessage(field.label, field.min, field.max)
                      : undefined
                  }
                >
                  <Input
                    id={`metabolic-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? '1'}
                    aria-invalid={formState.errors[field.key] ? true : undefined}
                    {...register(field.key, {
                      // An empty input must become undefined, not NaN, or
                      // z.number().optional() rejects every blank field.
                      setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
                    })}
                  />
                </Field>
              ))}
              {group.title === 'Blood sugar' && (
                <Field
                  label="Glucose taken"
                  htmlFor="metabolic-glucoseContext"
                  helper="Needed with a glucose reading."
                  error={
                    formState.errors.glucoseContext
                      ? 'Choose when the glucose was taken.'
                      : undefined
                  }
                >
                  <Select
                    id="metabolic-glucoseContext"
                    aria-invalid={formState.errors.glucoseContext ? true : undefined}
                    {...register('glucoseContext', {
                      setValueAs: (value: string) => (value === '' ? undefined : value),
                    })}
                  >
                    <option value="">Not set</option>
                    {GLUCOSE_CONTEXTS.map((c) => (
                      <option key={c} value={c}>
                        {humanize(c)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </fieldset>
        ))}
        {groupError && (
          <p role="alert" className="text-[13px] text-danger-fg">
            {groupError}
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

export function MetabolicSection({
  encounterId,
  workups,
  role,
  closed,
  onChange,
}: {
  encounterId: string;
  workups: MetabolicWorkup[];
  role: StaffRole | undefined;
  /** A discharged visit: read only. */
  closed: boolean;
  onChange: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const canWrite = !closed && can(role, 'vitals:write');

  return (
    <Card>
      <CardHeader
        title="Metabolic workup"
        description="Blood sugar, lipids and body composition."
        action={
          canWrite ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => setRecording(true)}
            >
              Record workup
            </Button>
          ) : undefined
        }
      />
      <div className="p-5">
        {workups.length === 0 ? (
          <p className="text-sm text-fg-muted">No metabolic workup recorded for this visit.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workups.map((w) => (
              <li key={w.id} className="rounded-control bg-surface-muted px-3 py-2 text-sm text-fg">
                <span className="tabular mr-2 text-xs text-fg-subtle">
                  {formatDate(w.createdAt)} {formatTime(w.createdAt)}
                </span>
                <span className="tabular">{summarize(w)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {recording && (
        <RecordWorkupDialog
          encounterId={encounterId}
          onClose={() => setRecording(false)}
          onSaved={onChange}
        />
      )}
    </Card>
  );
}
