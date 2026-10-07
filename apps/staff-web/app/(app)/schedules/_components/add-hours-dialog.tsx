'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { invalidProps, requiredProps, type FieldErrors } from '../../../../lib/forms';
import { humanize } from '../../../../lib/format';

export interface Doctor {
  id: string;
  fullName: string;
  role: string;
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60];

/** Mounted only while open, so the form starts empty every time. */
export function AddHoursDialog(props: {
  open: boolean;
  doctors: Doctor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return props.open ? <AddHoursForm {...props} /> : null;
}

/**
 * Adds the same hours on several weekdays at once (one availability window
 * per day). A day that overlaps hours the doctor already has is skipped
 * and named, so nothing is double-booked.
 */
function AddHoursForm({
  open,
  doctors,
  onClose,
  onSaved,
}: {
  open: boolean;
  doctors: Doctor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [doctorId, setDoctorId] = useState(doctors.length === 1 ? doctors[0]!.id : '');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('13:00');
  const [slot, setSlot] = useState('15');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const toggle = (day: number) => {
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));
    setErrors((e) => ({ ...e, 'hours-days': undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next: FieldErrors = {};
    if (!doctorId) next['hours-doctor'] = 'Choose a doctor.';
    if (days.length === 0) next['hours-days'] = 'Choose at least one day.';
    if (!start) next['hours-start'] = 'Enter a start time.';
    if (!end) next['hours-end'] = 'Enter an end time.';
    else if (start && end <= start)
      next['hours-end'] = 'The end time must be after the start time.';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setBusy(true);
    setError(undefined);
    const clashes: string[] = [];
    let saved = 0;
    try {
      for (const dayOfWeek of WEEK.filter((d) => days.includes(d))) {
        try {
          await apiClient.post('/doctor-availability', {
            doctorId,
            dayOfWeek,
            startTime: start,
            endTime: end,
            slotMinutes: Number(slot),
          });
          saved += 1;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) clashes.push(DAYS[dayOfWeek]!);
          else throw e;
        }
      }
      if (saved > 0) onSaved();
      if (clashes.length > 0) {
        setError(
          `${saved > 0 ? 'Saved the other days. ' : ''}Not added on ${clashes.join(', ')}: those hours overlap hours the doctor already has.`,
        );
      } else {
        onClose();
      }
    } catch {
      if (saved > 0) onSaved();
      setError('The hours were not all saved. Please check the schedule and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Add hours"
      description="Patients can book these times online straight away."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="add-hours-form" loading={busy}>
            Add hours
          </Button>
        </>
      }
    >
      <form id="add-hours-form" noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Doctor *" htmlFor="hours-doctor" error={errors['hours-doctor']}>
          <Select
            id="hours-doctor"
            value={doctorId}
            {...requiredProps}
            {...invalidProps(errors['hours-doctor'])}
            onChange={(e) => {
              setDoctorId(e.target.value);
              setErrors((x) => ({ ...x, 'hours-doctor': undefined }));
            }}
          >
            <option value="">Choose a doctor</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName} ({humanize(d.role)})
              </option>
            ))}
          </Select>
        </Field>

        <fieldset aria-describedby={errors['hours-days'] ? 'hours-days-error' : undefined}>
          <legend className="mb-2 block text-sm font-medium text-fg">
            Days
            <span aria-hidden="true" className="ml-0.5 text-danger-fg">
              *
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {WEEK.map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(day)}
                  className={`h-10 min-w-14 cursor-pointer rounded-control border px-3 text-sm font-medium ${
                    on
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-control bg-surface text-fg hover:bg-surface-muted'
                  }`}
                >
                  {DAYS[day]!.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {errors['hours-days'] && (
            <p id="hours-days-error" role="alert" className="mt-1.5 text-[13px] text-danger-fg">
              {errors['hours-days']}
            </p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <Field label="From *" htmlFor="hours-start" error={errors['hours-start']}>
            <Input
              id="hours-start"
              type="time"
              value={start}
              {...requiredProps}
              {...invalidProps(errors['hours-start'])}
              onChange={(e) => {
                setStart(e.target.value);
                setErrors((x) => ({ ...x, 'hours-start': undefined, 'hours-end': undefined }));
              }}
            />
          </Field>
          <Field label="Until *" htmlFor="hours-end" error={errors['hours-end']}>
            <Input
              id="hours-end"
              type="time"
              value={end}
              {...requiredProps}
              {...invalidProps(errors['hours-end'])}
              onChange={(e) => {
                setEnd(e.target.value);
                setErrors((x) => ({ ...x, 'hours-end': undefined }));
              }}
            />
          </Field>
        </div>

        <Field
          label="Length of each visit *"
          htmlFor="hours-slot"
          helper="Patients pick one of these times when they book."
        >
          <Select id="hours-slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
            {SLOT_LENGTHS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </Field>

        {error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
