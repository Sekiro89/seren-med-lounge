'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordVitalSchema, type RecordVitalInput } from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { apiErrorMessage, type Vital } from './types';
import { clearOnEditRhf } from '../../../../lib/forms';

// min and max mirror recordVitalSchema so the browser and the schema agree.
const FIELDS: {
  key: Exclude<keyof RecordVitalInput, 'encounterId'>;
  label: string;
  min: number;
  max: number;
  step?: string;
}[] = [
  { key: 'bloodPressureSystolic', label: 'BP systolic', min: 40, max: 300 },
  { key: 'bloodPressureDiastolic', label: 'BP diastolic', min: 20, max: 200 },
  { key: 'pulseBpm', label: 'Pulse (bpm)', min: 20, max: 250 },
  { key: 'spo2Percent', label: 'SpO2 (%)', min: 0, max: 100 },
  { key: 'temperatureCelsius', label: 'Temp (°C)', min: 25, max: 45, step: '0.1' },
  { key: 'respiratoryRate', label: 'Resp. rate (/min)', min: 1, max: 100 },
  { key: 'heightCm', label: 'Height (cm)', min: 20, max: 272, step: '0.1' },
  { key: 'weightKg', label: 'Weight (kg)', min: 0.5, max: 500, step: '0.1' },
  { key: 'bmi', label: 'BMI', min: 5, max: 100, step: '0.1' },
];

function rangeMessage(label: string, min: number, max: number): string {
  return `${label}: enter a number from ${min} to ${max}.`;
}

function summarize(vital: Vital): string {
  return [
    vital.bloodPressureSystolic &&
      vital.bloodPressureDiastolic &&
      `BP ${vital.bloodPressureSystolic}/${vital.bloodPressureDiastolic}`,
    vital.pulseBpm && `Pulse ${vital.pulseBpm}`,
    vital.spo2Percent && `SpO2 ${vital.spo2Percent}%`,
    vital.temperatureCelsius && `Temp ${vital.temperatureCelsius}°C`,
    vital.respiratoryRate && `Resp ${vital.respiratoryRate}/min`,
    vital.heightCm && `Height ${vital.heightCm} cm`,
    vital.weightKg && `Weight ${vital.weightKg} kg`,
    vital.bmi && `BMI ${vital.bmi}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function VitalsSection({
  encounterId,
  vitals,
  role,
  onChange,
}: {
  encounterId: string;
  vitals: Vital[];
  role: StaffRole | undefined;
  onChange: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, clearErrors, formState } = useForm<RecordVitalInput>({
    resolver: zodResolver(recordVitalSchema),
    reValidateMode: 'onSubmit',
    defaultValues: { encounterId },
  });

  const onSubmit = async (data: RecordVitalInput) => {
    setFormError(null);
    try {
      await apiClient.post('/vitals', { ...data, encounterId });
      reset({ encounterId });
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not record vitals.'));
    }
  };

  // Per-field errors sit under each input; the "at least one vital" rule
  // belongs to the whole form, so it is shown once below the grid.
  const groupError = (formState.errors as Record<string, { message?: string } | undefined>)['']
    ?.message;

  return (
    <Card>
      <CardHeader title="Vitals" />
      <div className="p-5">
        {vitals.length === 0 ? (
          <p className="mb-4 text-sm text-fg-muted">No vitals recorded yet.</p>
        ) : (
          <ul className="mb-5 flex flex-col gap-2">
            {vitals.map((vital) => (
              <li
                key={vital.id}
                className="rounded-control bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                <span className="tabular mr-2 text-xs text-fg-subtle">
                  {formatDate(vital.recordedAt)} {formatTime(vital.recordedAt)}
                </span>
                <span className="tabular">{summarize(vital)}</span>
              </li>
            ))}
          </ul>
        )}

        {can(role, 'vitals:write') && (
          <form
            onSubmit={handleSubmit(onSubmit)}
            onChange={clearOnEditRhf(clearErrors, () => setFormError(null), { '*': [''] })}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {FIELDS.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  htmlFor={`vital-${field.key}`}
                  error={
                    formState.errors[field.key]
                      ? rangeMessage(field.label, field.min, field.max)
                      : undefined
                  }
                >
                  <Input
                    id={`vital-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? '1'}
                    aria-invalid={formState.errors[field.key] ? true : undefined}
                    {...register(field.key, {
                      // valueAsNumber turns an empty input into NaN, which
                      // Zod's z.number().optional() rejects and silently
                      // blocks every submission with an empty field.
                      setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
                    })}
                  />
                </Field>
              ))}
            </div>
            <p className="text-[13px] text-fg-subtle">
              Enter at least one measurement. Leave the others blank.
            </p>
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
            <Button type="submit" loading={formState.isSubmitting} className="self-start">
              Record vitals
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
