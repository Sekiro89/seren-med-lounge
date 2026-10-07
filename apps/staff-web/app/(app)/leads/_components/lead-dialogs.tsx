'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { convertLeadSchema, leadStatusSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { clinicToday } from '../../../../lib/format';
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
import { PatientPicker, type PatientOption } from './patient-picker';
import { FormError, leadName, messageOf, type LeadDetail } from './shared';

export function LostDialog({
  lead,
  open,
  onClose,
  onSaved,
}: {
  lead: LeadDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return open ? <LostForm lead={lead} open={open} onClose={onClose} onSaved={onSaved} /> : null;
}

function LostForm({
  lead,
  open,
  onClose,
  onSaved,
}: {
  lead: LeadDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const parsed = leadStatusSchema.safeParse({ status: 'LOST', lostReason: reason.trim() });
    const next: FieldErrors = parsed.success
      ? {}
      : {
          'lost-reason': reason.trim()
            ? 'Use 500 characters or fewer.'
            : 'Write a short reason, so the team knows why.',
        };
    setErrors(next);
    if (!parsed.success) return focusFirst(next, ['lost-reason']);
    setBusy(true);
    try {
      await apiClient.post(`/leads/${lead.id}/status`, parsed.data);
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'The lead was not updated. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Mark ${leadName(lead)} as lost`}
      description="The lead leaves your open list. You can reopen it later by moving it back to nurturing."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lost-form" variant="danger" loading={busy}>
            Mark as lost
          </Button>
        </>
      }
    >
      <form
        id="lost-form"
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError)}
        className="flex flex-col gap-5"
      >
        <Field
          label={req('Why was this lead lost')}
          htmlFor="lost-reason"
          error={errors['lost-reason']}
        >
          <Textarea
            id="lost-reason"
            value={reason}
            maxLength={500}
            {...requiredProps}
            {...invalidProps(errors['lost-reason'])}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <FormError message={error} />
      </form>
    </Dialog>
  );
}

type ConvertMode = 'register' | 'link';

interface PendingReview {
  kind: string;
  candidates: { id: string }[];
}

export function ConvertDialog({
  lead,
  open,
  onClose,
  onSaved,
}: {
  lead: LeadDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return open ? <ConvertForm lead={lead} open={open} onClose={onClose} onSaved={onSaved} /> : null;
}

function ConvertForm({
  lead,
  open,
  onClose,
  onSaved,
}: {
  lead: LeadDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<ConvertMode>('register');
  const [dob, setDob] = useState('');
  const [lastName, setLastName] = useState(lead.lastName ?? '');
  const [patient, setPatient] = useState<PatientOption>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [review, setReview] = useState<PendingReview>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    if (mode === 'link' && !patient)
      next['convert-patient'] = 'Choose the patient to link this lead to.';
    if (mode === 'register') {
      if (!dob) next['convert-dob'] = 'Enter the date of birth.';
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) {
        next['convert-dob'] = 'Enter a valid date of birth.';
      } else if (dob > clinicToday())
        next['convert-dob'] = 'The date of birth cannot be in the future.';
      else if (dob < '1900-01-01') next['convert-dob'] = 'Enter a valid date of birth.';
      if (!lead.lastName && !lastName.trim()) {
        next['convert-last'] = 'Enter the last name. The patient record needs one.';
      } else if (!lead.lastName && lastName.trim().length > 100) {
        next['convert-last'] = 'Use 100 characters or fewer.';
      }
    }
    setErrors(next);
    if (!isClean(next)) return focusFirst(next, ['convert-last', 'convert-dob', 'convert-patient']);
    const body =
      mode === 'link'
        ? { patientId: patient?.id }
        : { dateOfBirth: dob, lastName: lead.lastName ? undefined : lastName.trim() || undefined };
    const parsed = convertLeadSchema.safeParse(body);
    if (!parsed.success) return setError('Check the details and try again.');
    setBusy(true);
    try {
      const result = await apiClient.post<{
        converted: boolean;
        registration?: PendingReview;
      }>(`/leads/${lead.id}/convert`, parsed.data);
      if (result.converted) {
        onSaved();
        onClose();
      } else {
        setReview(result.registration ?? { kind: 'possible_match', candidates: [] });
        onSaved();
      }
    } catch (e) {
      setError(messageOf(e, 'The lead was not converted. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (review) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="A possible match needs review"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Link
              href="/claims"
              className="inline-flex h-10 items-center rounded-control bg-primary px-5 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              Open patient claims
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-sm text-fg">
          <p>
            {leadName(lead)} was not converted yet. We found{' '}
            {review.candidates.length > 1
              ? 'more than one existing patient that could be the same person'
              : 'an existing patient that could be the same person'}
            , and creating another record could duplicate them.
          </p>
          <p className="text-fg-muted">
            A review request was opened. Resolve the possible duplicate under Patient claims first.
            Then come back to this lead and convert it by linking the patient you confirmed.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Convert ${leadName(lead)} to a patient`}
      description="This creates or links one patient record. Their consent to be contacted carries over."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="convert-form" loading={busy}>
            Convert to patient
          </Button>
        </>
      }
    >
      <form
        id="convert-form"
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError)}
        className="flex flex-col gap-5"
      >
        <Field label={req('How should the patient record be made')} htmlFor="convert-mode">
          <Select
            id="convert-mode"
            value={mode}
            {...requiredProps}
            onChange={(e) => {
              setMode(e.target.value as ConvertMode);
              setError(undefined);
              setErrors({});
            }}
          >
            <option value="register">Register a new patient from this lead</option>
            <option value="link">Link an existing patient</option>
          </Select>
        </Field>
        {mode === 'register' ? (
          <>
            {!lead.lastName && (
              <Field label={req('Last name')} htmlFor="convert-last" error={errors['convert-last']}>
                <Input
                  id="convert-last"
                  value={lastName}
                  maxLength={100}
                  {...requiredProps}
                  {...invalidProps(errors['convert-last'])}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </Field>
            )}
            <Field
              label={req('Date of birth')}
              htmlFor="convert-dob"
              error={errors['convert-dob']}
              helper="Name and phone are taken from the lead. If a similar patient already exists, you will be asked to review it first."
            >
              <Input
                id="convert-dob"
                type="date"
                value={dob}
                max={clinicToday()}
                {...requiredProps}
                {...invalidProps(errors['convert-dob'])}
                onChange={(e) => setDob(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field label={req('Patient')} htmlFor="convert-patient" error={errors['convert-patient']}>
            <PatientPicker
              id="convert-patient"
              value={patient}
              onChange={(p) => {
                setPatient(p);
                clearError('convert-patient');
              }}
            />
          </Field>
        )}
        <FormError message={error} />
      </form>
    </Dialog>
  );
}
