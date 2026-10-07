'use client';

import { useState, type FormEvent } from 'react';
import { createFollowUpSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { fullName, humanize } from '../../../../lib/format';
import {
  focusFirst,
  invalidProps,
  isClean,
  req,
  requiredProps,
  type FieldErrors,
} from '../../../../lib/forms';
import { messageOf, localToIso, type DoctorOption, type FollowUpRow } from './helpers';
import { PatientPicker, type PatientOption } from './patient-picker';

export const FOLLOW_UP_TYPES = [
  'REVIEW_APPOINTMENT',
  'MEDICATION_REMINDER',
  'RECOVERY_CHECK',
  'REPORT_ALERT',
  'OTHER',
] as const;

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

function DoctorSelect({
  id,
  doctors,
  value,
  onChange,
  emptyLabel,
}: {
  id: string;
  doctors: DoctorOption[];
  value: string;
  onChange: (v: string) => void;
  emptyLabel: string;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {doctors.map((d) => (
        <option key={d.id} value={d.id}>
          {d.fullName}
        </option>
      ))}
    </Select>
  );
}

/** Shared shell: owns busy and error state, closes and reloads on success. */
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

export function NewFollowUpDialog(props: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  doctors: DoctorOption[];
}) {
  // Mounted only while open so the form starts empty every time.
  return props.open ? <NewFollowUpForm {...props} /> : null;
}

function NewFollowUpForm({
  open,
  onClose,
  onSaved,
  doctors,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  doctors: DoctorOption[];
}) {
  const [patient, setPatient] = useState<PatientOption>();
  const [type, setType] = useState<string>('RECOVERY_CHECK');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [assignee, setAssignee] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { busy, error, setError, run } = useSubmit(() => {
    onSaved();
    onClose();
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    if (!patient) next['fu-patient'] = 'Choose the patient this follow-up is for.';
    if (!FOLLOW_UP_TYPES.includes(type as (typeof FOLLOW_UP_TYPES)[number])) {
      next['fu-type'] = 'Choose a type.';
    }
    if (!dueAt) next['fu-due'] = 'Choose when it is due.';
    else if (Number.isNaN(new Date(localToIso(dueAt)).getTime())) {
      next['fu-due'] = 'Enter a valid date and time.';
    } else if (new Date(localToIso(dueAt)).getTime() < Date.now() - 60_000) {
      next['fu-due'] = 'Choose a due time that is not in the past.';
    }
    if (notes.length > 2000) next['fu-notes'] = 'Use 2000 characters or fewer.';
    setErrors(next);
    if (!isClean(next) || !patient) {
      return focusFirst(next, ['fu-patient', 'fu-type', 'fu-due', 'fu-notes']);
    }
    const parsed = createFollowUpSchema.safeParse({
      patientId: patient.id,
      type,
      dueAt: localToIso(dueAt),
      notes: notes.trim() || undefined,
      assignedToId: assignee || undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form.');
    void run(() => apiClient.post('/follow-ups', parsed.data), 'The follow-up was not saved.');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New follow-up"
      description="A check-in or review to do for a patient after treatment."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-follow-up-form" loading={busy}>
            Create follow-up
          </Button>
        </>
      }
    >
      <form id="new-follow-up-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={req('Patient')} htmlFor="fu-patient" error={errors['fu-patient']}>
          <PatientPicker id="fu-patient" value={patient} onChange={setPatient} />
        </Field>
        <Field label={req('Type')} htmlFor="fu-type" error={errors['fu-type']}>
          <Select
            id="fu-type"
            value={type}
            {...requiredProps}
            {...invalidProps(errors['fu-type'])}
            onChange={(e) => setType(e.target.value)}
          >
            {FOLLOW_UP_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={req('Due')} htmlFor="fu-due" error={errors['fu-due']}>
          <Input
            id="fu-due"
            type="datetime-local"
            value={dueAt}
            {...requiredProps}
            {...invalidProps(errors['fu-due'])}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor="fu-notes" error={errors['fu-notes']}>
          <Textarea
            id="fu-notes"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {doctors.length > 0 && (
          <Field label="Assign to (optional)" htmlFor="fu-assignee">
            <DoctorSelect
              id="fu-assignee"
              doctors={doctors}
              value={assignee}
              onChange={setAssignee}
              emptyLabel="Unassigned"
            />
          </Field>
        )}
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

export type RowAction = 'done' | 'missed' | 'escalate' | 'book';

export function RowActionDialog(props: {
  action: RowAction | undefined;
  row: FollowUpRow | undefined;
  doctors: DoctorOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!props.action || !props.row) return null;
  return (
    <RowActionForm
      key={`${props.row.id}-${props.action}`}
      {...props}
      action={props.action}
      row={props.row}
    />
  );
}

function RowActionForm({
  action,
  row,
  doctors,
  onClose,
  onSaved,
}: {
  action: RowAction;
  row: FollowUpRow;
  doctors: DoctorOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [doctor, setDoctor] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { busy, error, setError, run } = useSubmit(() => {
    onSaved();
    onClose();
  });

  const open = true;
  const who = fullName(row.patient);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const base = `/follow-ups/${row.id}`;
    const next: FieldErrors = {};
    if (action === 'escalate' && !text.trim()) {
      next['fu-found'] = 'Write what you found so the next person can act on it.';
    }
    if (text.length > 2000) {
      next[action === 'escalate' ? 'fu-found' : 'fu-outcome'] = 'Use 2000 characters or fewer.';
    }
    if (action === 'book') {
      if (!when) next['fu-when'] = 'Choose the date and time of the review visit.';
      else if (new Date(localToIso(when)).getTime() < Date.now() - 60_000) {
        next['fu-when'] = 'Choose a review time that is not in the past.';
      }
    }
    setErrors(next);
    if (!isClean(next)) return focusFirst(next, ['fu-found', 'fu-outcome', 'fu-when']);
    if (action === 'done' || action === 'missed') {
      void run(
        () => apiClient.post(`${base}/${action}`, text.trim() ? { outcome: text.trim() } : {}),
        'That did not go through. Please try again.',
      );
    } else if (action === 'escalate') {
      void run(
        () =>
          apiClient.post(`${base}/escalate`, {
            outcome: text.trim(),
            ...(doctor ? { assignedToId: doctor } : {}),
          }),
        'That did not go through. Please try again.',
      );
    } else {
      void run(
        () =>
          apiClient.post(`${base}/book`, {
            scheduledAt: localToIso(when),
            ...(doctor ? { doctorId: doctor } : {}),
          }),
        'The review could not be booked.',
      );
    }
  };

  const copy = {
    done: {
      title: 'Mark done',
      confirm: 'Mark done',
      description: `Close the follow-up for ${who}.`,
    },
    missed: {
      title: 'Mark missed',
      confirm: 'Mark missed',
      description: `${who} could not be reached or did not respond.`,
    },
    escalate: {
      title: 'Escalate to a doctor',
      confirm: 'Escalate',
      description: `Record what the check-in found for ${who}.`,
    },
    book: {
      title: 'Book review',
      confirm: 'Book review',
      description: `Book the review visit for ${who}.`,
    },
  }[action];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="row-action-form" loading={busy}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <form id="row-action-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {(action === 'done' || action === 'missed') && (
          <Field label="Outcome (optional)" htmlFor="fu-outcome" error={errors['fu-outcome']}>
            <Textarea
              id="fu-outcome"
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
        )}
        {action === 'escalate' && (
          <>
            <Field label={req('What was found')} htmlFor="fu-found" error={errors['fu-found']}>
              <Textarea
                id="fu-found"
                value={text}
                maxLength={2000}
                {...requiredProps}
                {...invalidProps(errors['fu-found'])}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            {doctors.length > 0 ? (
              <Field
                label="Hand over to (optional)"
                htmlFor="fu-handover"
                helper="Left empty, every senior doctor is notified."
              >
                <DoctorSelect
                  id="fu-handover"
                  doctors={doctors}
                  value={doctor}
                  onChange={setDoctor}
                  emptyLabel="Any senior doctor"
                />
              </Field>
            ) : (
              <p className="text-[13px] text-fg-subtle">
                Every senior doctor will be notified of this escalation.
              </p>
            )}
          </>
        )}
        {action === 'book' && (
          <>
            <Field label={req('Review date and time')} htmlFor="fu-when" error={errors['fu-when']}>
              <Input
                id="fu-when"
                type="datetime-local"
                value={when}
                {...requiredProps}
                {...invalidProps(errors['fu-when'])}
                onChange={(e) => setWhen(e.target.value)}
              />
            </Field>
            {doctors.length > 0 && (
              <Field label="Doctor (optional)" htmlFor="fu-book-doctor">
                <DoctorSelect
                  id="fu-book-doctor"
                  doctors={doctors}
                  value={doctor}
                  onChange={setDoctor}
                  emptyLabel="Any available doctor"
                />
              </Field>
            )}
          </>
        )}
        <FormError message={error} />
      </form>
    </Dialog>
  );
}
