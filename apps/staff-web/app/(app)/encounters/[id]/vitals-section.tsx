'use client';

import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordVitalSchema, type RecordVitalInput } from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { LinkButton } from './document';
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

/** The existing vitals form (nurse desk), in a dialog opened from "Vitals today". */
function RecordVitalsDialog({
  encounterId,
  onClose,
  onSaved,
}: {
  encounterId: string;
  onClose: () => void;
  onSaved: () => void;
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
      onSaved();
      onClose();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not record vitals.'));
    }
  };

  // Per-field errors sit under each input; the "at least one vital" rule
  // belongs to the whole form, so it is shown once below the grid.
  const groupError = (formState.errors as Record<string, { message?: string } | undefined>)['']
    ?.message;

  return (
    <Dialog
      open
      onClose={() => !formState.isSubmitting && onClose()}
      title="Record vitals"
      description="Enter at least one measurement. Leave the others blank."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="vitals-form" loading={formState.isSubmitting}>
            Record vitals
          </Button>
        </>
      }
    >
      <form
        id="vitals-form"
        onSubmit={handleSubmit(onSubmit)}
        onChange={clearOnEditRhf(clearErrors, () => setFormError(null), { '*': [''] })}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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

function Row({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <>
      <dt className={`flex h-8 items-center text-fg-muted ${last ? '' : 'border-b border-line'}`}>
        {label}
      </dt>
      <dd
        className={`flex h-8 items-center font-mono tabular text-fg ${last ? '' : 'border-b border-line'}`}
      >
        {children}
      </dd>
    </>
  );
}

const Sep = () => (
  <span className="mx-1.5 font-sans text-fg-subtle" aria-hidden="true">
    ·
  </span>
);

/**
 * "Vitals today" in the document's context band: the latest reading as a
 * ruled list, with the systolic change since the previous visit when we
 * know it. Nurses (vitals:write) record from here.
 */
export function VitalsToday({
  encounterId,
  vitals,
  previous,
  role,
  onChange,
}: {
  encounterId: string;
  vitals: Vital[];
  /** Last reading from the previous visit, for the change shown beside BP. */
  previous: { vital: Vital; date: string } | undefined;
  role: StaffRole | undefined;
  onChange: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const latest = vitals[0];
  const canRecord = can(role, 'vitals:write');
  const delta =
    latest?.bloodPressureSystolic != null && previous?.vital.bloodPressureSystolic != null
      ? latest.bloodPressureSystolic - previous.vital.bloodPressureSystolic
      : undefined;

  const rows: { label: string; value: ReactNode }[] = [];
  if (latest) {
    if (latest.bloodPressureSystolic && latest.bloodPressureDiastolic) {
      rows.push({
        label: 'BP',
        value: (
          <>
            {latest.bloodPressureSystolic}/{latest.bloodPressureDiastolic}
            {delta !== undefined && delta !== 0 && previous && (
              <span className="ml-2 font-sans text-[11px] text-fg-muted">
                <span aria-hidden="true">
                  {delta < 0 ? '↓' : '↑'} {Math.abs(delta)}
                </span>
                <span className="sr-only">
                  {delta < 0 ? 'down' : 'up'} {Math.abs(delta)} since {formatDate(previous.date)}
                </span>
              </span>
            )}
          </>
        ),
      });
    }
    if (latest.pulseBpm) rows.push({ label: 'Pulse', value: latest.pulseBpm });
    if (latest.spo2Percent || latest.temperatureCelsius) {
      rows.push({
        label: 'SpO\u2082 · Temp',
        value: (
          <>
            {latest.spo2Percent ? `${latest.spo2Percent}%` : '-'}
            <Sep />
            {latest.temperatureCelsius ? `${latest.temperatureCelsius}°` : '-'}
          </>
        ),
      });
    }
    if (latest.respiratoryRate) rows.push({ label: 'Resp. rate', value: latest.respiratoryRate });
    if (latest.weightKg || latest.bmi) {
      rows.push({
        label: 'Wt · BMI',
        value: (
          <>
            {latest.weightKg ?? '-'}
            {latest.weightKg ? (
              <span className="ml-1 font-sans text-xs text-fg-muted">kg</span>
            ) : null}
            <Sep />
            {latest.bmi ?? '-'}
          </>
        ),
      });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-fg pb-1.5">
        <h3 className="text-[13px] font-semibold text-fg">Vitals today</h3>
        {canRecord && (
          <LinkButton small onClick={() => setRecording(true)}>
            {latest ? 'Record again' : 'Record vitals'}
          </LinkButton>
        )}
      </div>
      {latest ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-[13px]">
          {rows.map((row, i) => (
            <Row key={row.label} label={row.label} last={i === rows.length - 1}>
              {row.value}
            </Row>
          ))}
        </dl>
      ) : (
        <p className="py-2 text-[13px] text-fg-muted">Not recorded yet.</p>
      )}
      {vitals.length > 1 && (
        <p className="mt-1 text-xs text-fg-muted">
          <span className="font-mono">{vitals.length}</span> readings this visit, all under Other
          records.
        </p>
      )}
      {recording && (
        <RecordVitalsDialog
          encounterId={encounterId}
          onClose={() => setRecording(false)}
          onSaved={onChange}
        />
      )}
    </div>
  );
}

/** Every reading on this visit, newest first (for Other records). */
export function VitalsLog({ vitals }: { vitals: Vital[] }) {
  return (
    <ul className="divide-y divide-line">
      {vitals.map((vital) => (
        <li key={vital.id} className="flex flex-wrap gap-x-3 py-2 text-[13px] text-fg">
          <span className="font-mono text-xs text-fg-subtle">
            {formatDate(vital.recordedAt)} {formatTime(vital.recordedAt)}
          </span>
          <span className="font-mono tabular">{summarize(vital)}</span>
        </li>
      ))}
    </ul>
  );
}
