'use client';

import { useState, type FormEvent } from 'react';
import { createTaskSchema } from '@serenemed/validation';
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
  type FieldErrors,
  clearOnEdit,
  makeClearError,
} from '../../../../lib/forms';
import { humanize } from '../../../../lib/format';
import { PatientPicker, type PatientOption } from '../../follow-ups/_components/patient-picker';
import { localToIso, messageOf } from './helpers';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export function NewTaskDialog(props: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  canPickPatient: boolean;
  staff: { id: string; fullName: string; role: string }[];
}) {
  // Mounted only while open so the form starts empty every time.
  return props.open ? <NewTaskForm {...props} /> : null;
}

function NewTaskForm({
  open,
  onClose,
  onSaved,
  canPickPatient,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  canPickPatient: boolean;
  staff: { id: string; fullName: string; role: string }[];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<string>('NORMAL');
  const [patient, setPatient] = useState<PatientOption>();
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    if (!title.trim()) next['task-title'] = 'Enter a title for the task.';
    else if (title.trim().length > 200) next['task-title'] = 'Use 200 characters or fewer.';
    if (description.length > 2000) next['task-description'] = 'Use 2000 characters or fewer.';
    if (dueAt) {
      const due = new Date(localToIso(dueAt)).getTime();
      if (Number.isNaN(due)) next['task-due'] = 'Enter a valid date and time.';
      else if (due < Date.now() - 60_000)
        next['task-due'] = 'Choose a due time that is not in the past.';
    }
    if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
      next['task-priority'] = 'Choose a priority.';
    }
    setErrors(next);
    if (!isClean(next)) {
      return focusFirst(next, ['task-title', 'task-description', 'task-due', 'task-priority']);
    }
    const parsed = createTaskSchema.safeParse({
      title: title.trim(),
      description: description.trim() || undefined,
      patientId: patient?.id,
      dueAt: dueAt ? localToIso(dueAt) : undefined,
      priority,
      assigneeId: assignee || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post('/tasks', parsed.data);
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'The task was not saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New task"
      description="Leave it with you as a reminder, or hand it to a colleague."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-task-form" loading={busy}>
            Create task
          </Button>
        </>
      }
    >
      <form
        id="new-task-form"
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError)}
        className="flex flex-col gap-4"
      >
        <Field label={req('Title')} htmlFor="task-title" error={errors['task-title']}>
          <Input
            id="task-title"
            value={title}
            maxLength={200}
            {...requiredProps}
            {...invalidProps(errors['task-title'])}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Details (optional)"
          htmlFor="task-description"
          error={errors['task-description']}
        >
          <Textarea
            id="task-description"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Due (optional)" htmlFor="task-due" error={errors['task-due']}>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueAt}
              {...invalidProps(errors['task-due'])}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </Field>
          <Field label={req('Priority')} htmlFor="task-priority" error={errors['task-priority']}>
            <Select
              id="task-priority"
              value={priority}
              {...requiredProps}
              {...invalidProps(errors['task-priority'])}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Assign to"
          htmlFor="task-assignee"
          helper="A colleague you assign this to is notified."
        >
          <Select id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Just me</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({humanize(u.role)})
              </option>
            ))}
          </Select>
        </Field>
        {canPickPatient && (
          <Field label="Patient (optional)" htmlFor="task-patient">
            <PatientPicker id="task-patient" value={patient} onChange={setPatient} />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
