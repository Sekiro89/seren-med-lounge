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

const FIELDS: { key: keyof RecordVitalInput; label: string; step?: string }[] = [
  { key: 'bloodPressureSystolic', label: 'BP systolic' },
  { key: 'bloodPressureDiastolic', label: 'BP diastolic' },
  { key: 'pulseBpm', label: 'Pulse (bpm)' },
  { key: 'spo2Percent', label: 'SpO2 (%)' },
  { key: 'temperatureCelsius', label: 'Temp (°C)', step: '0.1' },
  { key: 'respiratoryRate', label: 'Resp. rate (/min)' },
  { key: 'heightCm', label: 'Height (cm)', step: '0.1' },
  { key: 'weightKg', label: 'Weight (kg)', step: '0.1' },
  { key: 'bmi', label: 'BMI', step: '0.1' },
];

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
  const { register, handleSubmit, reset, formState } = useForm<RecordVitalInput>({
    resolver: zodResolver(recordVitalSchema),
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

  const validationMessages = Object.values(formState.errors)
    .filter((error) => error && 'message' in error && error.message)
    .map((error) => String((error as { message?: string }).message));

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
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {FIELDS.map((field) => (
                <Field key={field.key} label={field.label} htmlFor={`vital-${field.key}`}>
                  <Input
                    id={`vital-${field.key}`}
                    type="number"
                    step={field.step}
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
            {validationMessages.map((message, index) => (
              <p key={index} role="alert" className="text-[13px] text-danger-fg">
                {message}
              </p>
            ))}
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
