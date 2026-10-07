'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordVitalSchema, type RecordVitalInput } from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Button, Card } from '@serenemed/ui';
import { apiClient } from '../../../lib/api-client';
import { can } from '../../../lib/permissions';
import { apiErrorMessage, type Vital } from './types';

const FIELDS: { key: keyof RecordVitalInput; label: string; step?: string }[] = [
  { key: 'bloodPressureSystolic', label: 'BP systolic' },
  { key: 'bloodPressureDiastolic', label: 'BP diastolic' },
  { key: 'pulseBpm', label: 'Pulse (bpm)' },
  { key: 'spo2Percent', label: 'SpO2 (%)' },
  { key: 'temperatureCelsius', label: 'Temp (°C)', step: '0.1' },
  { key: 'bmi', label: 'BMI', step: '0.1' },
];

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

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Vitals</h2>
      {vitals.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No vitals recorded yet.</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {vitals.map((vital) => (
            <li key={vital.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="text-xs text-slate-400">
                {new Date(vital.recordedAt).toLocaleString()} —{' '}
              </span>
              {[
                vital.bloodPressureSystolic &&
                  vital.bloodPressureDiastolic &&
                  `BP ${vital.bloodPressureSystolic}/${vital.bloodPressureDiastolic}`,
                vital.pulseBpm && `Pulse ${vital.pulseBpm}`,
                vital.spo2Percent && `SpO2 ${vital.spo2Percent}%`,
                vital.temperatureCelsius && `Temp ${vital.temperatureCelsius}°C`,
                vital.bmi && `BMI ${vital.bmi}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </li>
          ))}
        </ul>
      )}

      {can(role, 'vitals:write') && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
          <div className="grid grid-cols-3 gap-3">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  {field.label}
                </label>
                <input
                  type="number"
                  step={field.step}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  {...register(field.key, {
                    // valueAsNumber turns an empty input into NaN, not
                    // undefined — Zod's z.number().optional() rejects
                    // NaN (it's neither a valid number nor undefined),
                    // which silently blocked every submission that left
                    // any field empty, with no visible error and no
                    // network request. Caught live by actually
                    // submitting this form in a browser with a partial
                    // set of vitals filled in, not by typecheck.
                    setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
                  })}
                />
              </div>
            ))}
          </div>
          {formState.errors.root && (
            <p className="text-xs text-red-600">{formState.errors.root.message}</p>
          )}
          {Object.values(formState.errors)
            .filter((error) => error && 'message' in error && error.message)
            .map((error, index) => (
              <p key={index} className="text-xs text-red-600">
                {String((error as { message?: string }).message)}
              </p>
            ))}
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <Button type="submit" disabled={formState.isSubmitting} className="self-start">
            {formState.isSubmitting ? 'Recording…' : 'Record vitals'}
          </Button>
        </form>
      )}
    </Card>
  );
}
