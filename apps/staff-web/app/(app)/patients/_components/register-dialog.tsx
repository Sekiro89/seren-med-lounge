'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, KeyReturn, UserPlus, Warning } from '@phosphor-icons/react';
import { z } from 'zod';
import { patientRegistrationSchema, type PatientRegistrationInput } from '@serenemed/validation';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { clinicToday, formatDate, fullName } from '../../../../lib/format';
import { clearOnEditRhf } from '../../../../lib/forms';
import { ageLabel, apiMessage, type PatientProfile } from './patient-shared';

type RegisterResult =
  | { kind: 'created'; patient: PatientProfile }
  | { kind: 'existing'; patient: PatientProfile; hasAccount: boolean }
  | { kind: 'possible_match'; claimRequestId: string; candidates: PatientProfile[] }
  | { kind: 'ambiguous_match'; claimRequestId: string; candidates: PatientProfile[] };

type ActivationResult =
  | { kind: 'created'; code: string; expiresAt: string }
  | { kind: 'duplicate_account'; patient: PatientProfile };

/**
 * The shared schema plus the checks the form needs to catch early:
 * whitespace-only names, phone numbers with letters, and birth dates
 * in the future or before 1900. Output still satisfies the shared schema.
 */
const registrationFormSchema = patientRegistrationSchema.extend({
  firstName: z
    .string()
    .trim()
    .min(1, 'Enter a first name.')
    .max(100, 'Use at most 100 characters.'),
  lastName: z.string().trim().min(1, 'Enter a last name.').max(100, 'Use at most 100 characters.'),
  dateOfBirth: z
    .string()
    .date('Enter a valid date of birth.')
    .refine((value) => value <= clinicToday(), 'Date of birth cannot be in the future.')
    .refine((value) => value >= '1900-01-01', 'Enter a valid date of birth.'),
  phone: z
    .string()
    .trim()
    .min(1, 'Enter a phone number.')
    .refine(
      (value) =>
        /^\+?[\d\s()-]+$/.test(value) &&
        value.replace(/\D/g, '').length >= 7 &&
        value.replace(/\D/g, '').length <= 15,
      'Enter a valid phone number with 7 to 15 digits.',
    ),
  email: z.string().trim().email('Enter a valid email address, or leave it blank.').optional(),
});

/** An empty optional email is "not given", not an invalid address. */
const resolver: Resolver<PatientRegistrationInput> = (values, context, options) =>
  zodResolver(registrationFormSchema)(
    { ...values, email: values.email?.trim() ? values.email.trim() : undefined },
    context,
    options,
  );

export function RegisterPatientDialog({
  open,
  onClose,
  onRegistered,
}: {
  open: boolean;
  onClose: () => void;
  /** Called when a brand new patient record exists, so the list can refresh. */
  onRegistered?: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register patient"
      description="We check for an existing record first, so nobody is registered twice."
    >
      {/* Mounted only while open, so every opening starts from a blank form. */}
      {open && <RegisterFlow onClose={onClose} onRegistered={onRegistered} />}
    </Dialog>
  );
}

function RegisterFlow({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered?: () => void;
}) {
  const router = useRouter();
  const [result, setResult] = useState<RegisterResult>();
  const [escalated, setEscalated] = useState(false);
  const [activation, setActivation] = useState<ActivationResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const {
    register,
    handleSubmit,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<PatientRegistrationInput>({ resolver, reValidateMode: 'onSubmit' });

  const openRecord = (patient: PatientProfile) => {
    onClose();
    router.push(`/patients/${patient.id}`);
  };

  const submit = handleSubmit(async (values) => {
    if (isSubmitting) return;
    setError(undefined);
    try {
      const res = await apiClient.post<RegisterResult>('/patients', values);
      if (res.kind === 'created') {
        onRegistered?.();
        openRecord(res.patient);
        return;
      }
      setResult(res);
    } catch (e) {
      setError(apiMessage(e, 'The patient could not be registered. Please try again.'));
    }
  });

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(apiMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const link = (claimRequestId: string, patientId: string) =>
    run(async () => {
      const patient = await apiClient.post<PatientProfile>(
        `/patient-claims/${claimRequestId}/link`,
        { patientId },
      );
      openRecord(patient);
    }, 'Could not confirm this patient. Please try again.');

  const createNew = (claimRequestId: string) =>
    run(async () => {
      const patient = await apiClient.post<PatientProfile>(
        `/patient-claims/${claimRequestId}/create-new`,
      );
      onRegistered?.();
      openRecord(patient);
    }, 'Could not create a new patient record. Please try again.');

  const escalate = (claimRequestId: string) =>
    run(async () => {
      await apiClient.post(`/patient-claims/${claimRequestId}/escalate`, {});
      setEscalated(true);
    }, 'Could not send this for review. Please try again.');

  const sendActivation = (patientId: string) =>
    run(async () => {
      setActivation(
        await apiClient.post<ActivationResult>(`/patients/${patientId}/send-activation`),
      );
    }, 'Could not create an activation code. Please try again.');

  const errorPanel = error && (
    <p role="alert" className="mt-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {error}
    </p>
  );

  // Sent for review: nothing more to do here.
  if (escalated) {
    return (
      <div>
        <div className="flex items-start gap-3">
          <CheckCircle size={24} className="mt-0.5 text-success-fg" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-fg">Sent for review</h3>
            <p className="mt-1 text-sm text-fg-muted">
              No patient record was created or changed. A senior colleague will check this against
              the existing records and decide.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  // Strong match: the patient is already registered.
  if (result?.kind === 'existing') {
    const { patient, hasAccount } = result;
    return (
      <div>
        <div className="flex items-start gap-3">
          <Warning size={24} className="mt-0.5 text-warning-fg" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-fg">Already registered</h3>
            <p className="mt-1 text-sm text-fg-muted">
              This person already has a record, so no new one was created.
            </p>
          </div>
        </div>

        <CandidateSummary patient={patient} />

        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Patient portal</span>
          {hasAccount ? (
            <Badge tone="success">Account active</Badge>
          ) : (
            <Badge tone="neutral">No account yet</Badge>
          )}
        </div>

        {activation?.kind === 'created' && (
          <div className="mt-4 rounded-panel border border-line bg-surface-muted p-4">
            <p className="text-[13px] font-medium text-fg-muted">Activation code</p>
            <p
              className="tabular mt-1 select-all font-mono text-2xl font-semibold tracking-[0.2em] text-fg"
              aria-label={`Activation code ${activation.code.split('').join(' ')}`}
            >
              {activation.code}
            </p>
            <p className="mt-2 text-[13px] text-fg-muted">
              Read this out to the patient now. It is shown only once, nothing is sent to them, and
              it expires on {formatDate(activation.expiresAt)}.
            </p>
          </div>
        )}
        {activation?.kind === 'duplicate_account' && (
          <p className="mt-4 rounded-control bg-info-bg px-3 py-2 text-sm text-info-fg">
            This patient already has a portal account, so no code was issued.
          </p>
        )}
        {errorPanel}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {!hasAccount && !activation && (
            <Button
              variant="secondary"
              icon={<KeyReturn size={18} aria-hidden="true" />}
              loading={busy}
              onClick={() => sendActivation(patient.id)}
            >
              Send account activation
            </Button>
          )}
          <Button onClick={() => openRecord(patient)}>Open record</Button>
        </div>
      </div>
    );
  }

  // Needs a human decision: possible or ambiguous match.
  if (result && result.kind !== 'created') {
    const { claimRequestId, candidates } = result;
    return (
      <div>
        <div className="flex items-start gap-3">
          <Warning size={24} className="mt-0.5 text-warning-fg" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-fg">
              {result.kind === 'possible_match'
                ? 'Possible existing patient found'
                : 'Several possible matches found'}
            </h3>
            <p className="mt-1 text-sm text-fg-muted">
              {result.kind === 'possible_match'
                ? 'This looks like someone already registered, possibly under a different phone number. Nothing has been changed.'
                : 'We cannot tell which record, if any, is this person. Nothing has been changed.'}{' '}
              Check the details with the patient before choosing.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="rounded-panel border border-line p-4">
              <CandidateSummary patient={candidate} bare />
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => link(claimRequestId, candidate.id)}
                >
                  This is the same patient
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {errorPanel}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => escalate(claimRequestId)}>
            Escalate for review
          </Button>
          <Button
            icon={<UserPlus size={18} aria-hidden="true" />}
            loading={busy}
            onClick={() => createNew(claimRequestId)}
          >
            None of these, create a new patient
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      onChange={clearOnEditRhf(clearErrors, () => setError(undefined))}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="reg-first" error={errors.firstName?.message}>
          <Input
            id="reg-first"
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={errors.firstName ? true : undefined}
            {...register('firstName')}
          />
        </Field>
        <Field label="Last name" htmlFor="reg-last" error={errors.lastName?.message}>
          <Input
            id="reg-last"
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={errors.lastName ? true : undefined}
            {...register('lastName')}
          />
        </Field>
        <Field label="Date of birth" htmlFor="reg-dob" error={errors.dateOfBirth?.message}>
          <Input
            id="reg-dob"
            type="date"
            min="1900-01-01"
            max={clinicToday()}
            required
            aria-required="true"
            aria-invalid={errors.dateOfBirth ? true : undefined}
            {...register('dateOfBirth')}
          />
        </Field>
        <Field label="Phone" htmlFor="reg-phone" error={errors.phone?.message}>
          <Input
            id="reg-phone"
            type="tel"
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={errors.phone ? true : undefined}
            {...register('phone')}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Email (optional)"
            htmlFor="reg-email"
            helper="Used for the patient portal and receipts."
            error={errors.email?.message}
          >
            <Input
              id="reg-email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
          </Field>
        </div>
      </div>
      {errorPanel}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Register patient
        </Button>
      </div>
    </form>
  );
}

function CandidateSummary({ patient, bare }: { patient: PatientProfile; bare?: boolean }) {
  return (
    <dl
      className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm ${
        bare ? '' : 'mt-4 rounded-panel border border-line p-4'
      }`}
    >
      <dt className="text-fg-muted">Name</dt>
      <dd className="font-medium text-fg">{fullName(patient)}</dd>
      <dt className="text-fg-muted">Date of birth</dt>
      <dd className="tabular text-fg">
        {formatDate(patient.dateOfBirth)} ({ageLabel(patient.dateOfBirth)})
      </dd>
      <dt className="text-fg-muted">Phone</dt>
      <dd className="tabular text-fg">{patient.phone}</dd>
    </dl>
  );
}
