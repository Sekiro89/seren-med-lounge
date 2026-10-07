'use client';

import { useState, type FormEvent } from 'react';
import {
  cancelProcedureSchema,
  procedureEstimateSchema,
  scheduleProcedureSchema,
} from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import {
  focusFirst,
  invalidProps,
  isClean,
  req,
  requiredProps,
  rupeesError,
  type FieldErrors,
  clearOnEdit,
  makeClearError,
} from '../../../../lib/forms';
import {
  isoToLocal,
  localToIso,
  messageOf,
  rupeesToPaise,
  type DoctorOption,
  type ProcedureDetail,
} from './helpers';

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      onDone();
    } catch (e) {
      setError(messageOf(e, fallback));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

interface Props {
  procedure: ProcedureDetail;
  onClose: () => void;
  onSaved: () => void;
}

export function EstimateDialog({ procedure, onClose, onSaved }: Props) {
  const [value, setValue] = useState(
    procedure.estimateMinor === null ? '' : String(procedure.estimateMinor / 100),
  );
  const { busy, error, setError, run } = useSubmit(() => {
    onSaved();
    onClose();
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    const amountError = rupeesError(value, { label: 'the estimate', maxMinor: 1_000_000_000 });
    if (amountError) next['est-amount'] = amountError;
    const estimateMinor = rupeesToPaise(value);
    const parsed = procedureEstimateSchema.safeParse({ estimateMinor });
    if (!parsed.success && !next['est-amount']) next['est-amount'] = 'Check the amount.';
    setErrors(next);
    if (!isClean(next) || !parsed.success) return focusFirst(next, ['est-amount']);
    void run(
      () => apiClient.post(`/procedures/${procedure.id}/estimate`, parsed.data),
      'The estimate was not saved.',
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit estimate"
      description={procedure.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="estimate-form" loading={busy}>
            Save estimate
          </Button>
        </>
      }
    >
      <form
        id="estimate-form"
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError)}
        className="flex flex-col gap-5"
      >
        <Field label={req('Estimate in rupees')} htmlFor="est-amount" error={errors['est-amount']}>
          <Input
            id="est-amount"
            inputMode="decimal"
            value={value}
            {...requiredProps}
            {...invalidProps(errors['est-amount'])}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

export function ScheduleDialog({
  procedure,
  doctors,
  onClose,
  onSaved,
}: Props & { doctors: DoctorOption[] }) {
  const [when, setWhen] = useState(procedure.scheduledAt ? isoToLocal(procedure.scheduledAt) : '');
  const [doctor, setDoctor] = useState(procedure.performedBy?.id ?? '');
  const [location, setLocation] = useState(procedure.location ?? '');
  const { busy, error, setError, run } = useSubmit(() => {
    onSaved();
    onClose();
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    if (!when) next['sch-when'] = 'Choose the date and time.';
    else if (Number.isNaN(new Date(`${when}:00+05:30`).getTime())) {
      next['sch-when'] = 'Enter a valid date and time.';
    } else if (new Date(`${when}:00+05:30`).getTime() < Date.now() - 60_000) {
      next['sch-when'] = 'Choose a time that is not in the past.';
    }
    if (!doctor) next['sch-doctor'] = 'Choose the doctor who will perform it.';
    if (location.length > 200) next['sch-location'] = 'Use 200 characters or fewer.';
    setErrors(next);
    if (!isClean(next)) return focusFirst(next, ['sch-when', 'sch-doctor', 'sch-location']);
    const parsed = scheduleProcedureSchema.safeParse({
      scheduledAt: localToIso(when),
      performedById: doctor,
      location: location.trim() || undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form.');
    void run(
      () => apiClient.post(`/procedures/${procedure.id}/schedule`, parsed.data),
      'The procedure was not scheduled.',
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={procedure.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
      description={procedure.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-form" loading={busy}>
            {procedure.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
          </Button>
        </>
      }
    >
      <form
        id="schedule-form"
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError)}
        className="flex flex-col gap-5"
      >
        <Field label={req('Date and time')} htmlFor="sch-when" error={errors['sch-when']}>
          <Input
            id="sch-when"
            type="datetime-local"
            value={when}
            {...requiredProps}
            {...invalidProps(errors['sch-when'])}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>
        <Field label={req('Doctor')} htmlFor="sch-doctor" error={errors['sch-doctor']}>
          <Select
            id="sch-doctor"
            value={doctor}
            {...requiredProps}
            {...invalidProps(errors['sch-doctor'])}
            onChange={(e) => setDoctor(e.target.value)}
          >
            <option value="">Choose a doctor</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Location (optional)"
          htmlFor="sch-location"
          helper="For example, the room."
          error={errors['sch-location']}
        >
          <Input
            id="sch-location"
            value={location}
            maxLength={200}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

export function CancelProcedureDialog({ procedure, onClose, onSaved }: Props) {
  const [reason, setReason] = useState('');
  const { busy, error, setError, run } = useSubmit(() => {
    onSaved();
    onClose();
  });
  const who = `${procedure.patient.firstName} ${procedure.patient.lastName}`.trim();
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const parsed = cancelProcedureSchema.safeParse({ reason: reason.trim() });
    const next: FieldErrors = parsed.success
      ? {}
      : {
          'cp-reason': reason.trim()
            ? 'Use 1000 characters or fewer.'
            : 'Write the reason for cancelling.',
        };
    setErrors(next);
    if (!parsed.success) return focusFirst(next, ['cp-reason']);
    void run(
      () => apiClient.post(`/procedures/${procedure.id}/cancel`, parsed.data),
      'The procedure was not cancelled.',
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancel procedure"
      description={`${procedure.name} for ${who}. This cannot be undone.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep procedure
          </Button>
          <Button type="submit" form="cancel-procedure-form" variant="danger" loading={busy}>
            Cancel procedure
          </Button>
        </>
      }
    >
      <form
        id="cancel-procedure-form"
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError)}
        className="flex flex-col gap-5"
      >
        <Field label={req('Reason')} htmlFor="cp-reason" error={errors['cp-reason']}>
          <Textarea
            id="cp-reason"
            value={reason}
            maxLength={1000}
            {...requiredProps}
            {...invalidProps(errors['cp-reason'])}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <FormError message={error} />
      </form>
    </Dialog>
  );
}
