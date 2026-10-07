'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarBlank, IdentificationCard, Stethoscope, UserPlus } from '@phosphor-icons/react';
import {
  createAppointmentSchema,
  patientRegistrationSchema,
  type CreateAppointmentInput,
  type PatientRegistrationInput,
} from '@serenemed/validation';
import { AppointmentEntrySource } from '@serenemed/types';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../components/ui/fields';
import {
  Figures,
  InkSection,
  InkSheet,
  InkStatus,
  MarginNote,
  SheetHead,
  SheetRail,
} from '../../../components/ui/ink';
import { LedgerTable, type LedgerColumn } from '../../../components/ui/ledger-table';
import { apiClient } from '../../../lib/api-client';
import {
  clinicToday,
  formatDate,
  formatLongDate,
  formatTime,
  fullName,
  humanize,
} from '../../../lib/format';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { PatientPicker, type PatientSummary } from './patient-picker';
import { clearOnEditRhf } from '../../../lib/forms';
import { CheckInDialog, type CheckInTarget } from '../appointments/_components/check-in-dialog';

interface AppointmentRow {
  id: string;
  status: string;
  entrySource: string;
  scheduledAt: string;
  patient: { id: string; firstName: string; lastName: string; dateOfBirth: string; phone: string };
  doctor?: { fullName: string } | null;
  encounter: { id: string } | null;
}

interface PatientProfile {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  createdAt: string;
}

/**
 * PatientsService.register's duplicate-detection outcome (see its doc
 * comment). The backend, not this form, decides whether this is a new
 * patient, an existing one, or needs review.
 */
type RegisterPatientResult =
  | { kind: 'created'; patient: PatientProfile }
  | { kind: 'existing'; patient: PatientProfile; hasAccount: boolean }
  | { kind: 'possible_match'; claimRequestId: string; candidates: PatientProfile[] }
  | { kind: 'ambiguous_match'; claimRequestId: string; candidates: PatientProfile[] };

type ActivationResult =
  | { kind: 'created'; code: string; expiresAt: string }
  | { kind: 'duplicate_account'; patient: PatientProfile };

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (typeof body === 'object' && body && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
    return fallback;
  }
  return 'Could not reach the server. Please try again.';
}

// The browser's datetime-local value ("2026-09-22T07:28") has no seconds
// or timezone, which the strict createAppointmentSchema rejects. Loosen
// just that field for form validation; onCreateAppointment converts it to
// a real ISO string before it reaches the API, which validates strictly.
const DAY_MS = 24 * 60 * 60 * 1000;

const appointmentFormSchema = createAppointmentSchema.extend({
  patientId: z.string().min(1, 'Choose a patient.'),
  scheduledAt: z
    .string()
    .min(1, 'Choose a date and time.')
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Enter a valid date and time.')
    .refine(
      (value) => new Date(value).getTime() >= Date.now() - DAY_MS,
      'The appointment time cannot be more than a day in the past.',
    )
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + 366 * DAY_MS,
      'The appointment time cannot be more than a year ahead.',
    ),
});

// The shared registration schema plus the checks the form needs to catch
// early: whitespace-only names, phone numbers with letters, and birth
// dates in the future or before 1900.
const patientFormSchema = patientRegistrationSchema.extend({
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
});

function MatchPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-warning-fg bg-warning-bg p-4">
      <p className="mb-2 text-sm font-semibold text-warning-fg">{title}</p>
      {children}
    </div>
  );
}

function PatientLine({ patient }: { patient: PatientProfile }) {
  return (
    <>
      <p className="text-sm font-medium text-fg">{fullName(patient)}</p>
      <p className="text-[13px] text-fg-muted">
        Date of birth {formatDate(patient.dateOfBirth)} · {patient.phone}
      </p>
    </>
  );
}

/**
 * The consultation workspace: appointments, checking a patient in (which
 * creates the Encounter at /encounters/[id]), picking or registering a
 * patient, and booking an appointment.
 */
export default function ConsultationsPage() {
  const router = useRouter();
  const user = useStaff();
  const canReadAppointments = can(user.role, 'appointment:read');
  const canWriteAppointments = can(user.role, 'appointment:write');
  // Check-in opens the visit (appointment:write) and registers it, which
  // issues the queue token (patient:write), the same as the front desk.
  const canCheckIn = canWriteAppointments && can(user.role, 'patient:write');
  const { data, loading, errorStatus, reload } = useApi<AppointmentRow[]>(
    canReadAppointments ? '/appointments' : null,
  );

  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [showRegisterPatient, setShowRegisterPatient] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<CheckInTarget | null>(null);
  const [registerOutcome, setRegisterOutcome] = useState<RegisterPatientResult | null>(null);
  const [activationOutcome, setActivationOutcome] = useState<ActivationResult | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);

  const appointmentForm = useForm<z.infer<typeof appointmentFormSchema>>({
    resolver: zodResolver(appointmentFormSchema),
    reValidateMode: 'onSubmit',
    defaultValues: {
      patientId: '',
      entrySource: Object.values(AppointmentEntrySource)[0],
      scheduledAt: '',
    },
  });
  const patientForm = useForm<PatientRegistrationInput>({
    resolver: zodResolver(patientFormSchema),
    reValidateMode: 'onSubmit',
  });
  // One <form> wraps both react-hook-form instances; an edit clears that
  // control's error in whichever one owns it, and the page-level error.
  const clearAppointmentEdit = clearOnEditRhf(appointmentForm.clearErrors);
  const clearPatientEdit = clearOnEditRhf(patientForm.clearErrors, () => setFormError(null));

  // Picking a patient (a new record, an existing one Reception confirmed,
  // or the claim-resolution endpoints below) always ends the same way:
  // select it for the appointment form and close any register/claim UI.
  const selectPatient = (patient: PatientProfile) => {
    setSelectedPatient(patient);
    appointmentForm.setValue('patientId', patient.id, { shouldValidate: true });
    patientForm.reset();
    setShowRegisterPatient(false);
    setRegisterOutcome(null);
    setActivationOutcome(null);
  };

  const onRegisterPatient = async (input: PatientRegistrationInput) => {
    if (patientForm.formState.isSubmitting) return;
    setFormError(null);
    setActivationOutcome(null);
    try {
      const result = await apiClient.post<RegisterPatientResult>('/patients', input);
      if (result.kind === 'created') {
        selectPatient(result.patient);
      } else {
        setRegisterOutcome(result);
      }
    } catch (error) {
      setFormError(errorMessage(error, 'Could not register the patient.'));
    }
  };

  const handleConfirmSamePatient = async (claimRequestId: string, patientId: string) => {
    setFormError(null);
    setClaimBusy(true);
    try {
      const patient = await apiClient.post<PatientProfile>(
        `/patient-claims/${claimRequestId}/link`,
        { patientId },
      );
      selectPatient(patient);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not confirm this patient.'));
    } finally {
      setClaimBusy(false);
    }
  };

  const handleCreateNewFromClaim = async (claimRequestId: string) => {
    setFormError(null);
    setClaimBusy(true);
    try {
      const patient = await apiClient.post<PatientProfile>(
        `/patient-claims/${claimRequestId}/create-new`,
      );
      selectPatient(patient);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not create a new patient record.'));
    } finally {
      setClaimBusy(false);
    }
  };

  const handleEscalateClaim = async (claimRequestId: string) => {
    setFormError(null);
    setClaimBusy(true);
    try {
      await apiClient.post(`/patient-claims/${claimRequestId}/escalate`, {});
      setRegisterOutcome(null);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not escalate this case.'));
    } finally {
      setClaimBusy(false);
    }
  };

  const handleSendActivation = async (patientId: string) => {
    setFormError(null);
    setClaimBusy(true);
    try {
      const result = await apiClient.post<ActivationResult>(
        `/patients/${patientId}/send-activation`,
      );
      setActivationOutcome(result);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not create an activation code.'));
    } finally {
      setClaimBusy(false);
    }
  };

  const onCreateAppointment = async (input: CreateAppointmentInput) => {
    if (appointmentForm.formState.isSubmitting) return;
    setFormError(null);
    try {
      await apiClient.post('/appointments', {
        ...input,
        scheduledAt: new Date(input.scheduledAt).toISOString(),
      });
      appointmentForm.reset({
        patientId: '',
        entrySource: Object.values(AppointmentEntrySource)[0],
        scheduledAt: '',
      });
      setSelectedPatient(null);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, 'Could not create the appointment.'));
    }
  };

  const columns: LedgerColumn<AppointmentRow>[] = [
    {
      header: 'Scheduled',
      width: 'w-[150px]',
      numeric: true,
      render: (a) => (
        <span className="whitespace-nowrap">
          <span className="text-fg-muted">{formatDate(a.scheduledAt)}</span>{' '}
          {formatTime(a.scheduledAt)}
        </span>
      ),
    },
    {
      header: 'Patient',
      render: (a) => (
        <span className="block leading-tight">
          <span className="block font-medium">{fullName(a.patient)}</span>
          {a.doctor?.fullName && (
            <span className="block text-[12px] text-fg-muted">{a.doctor.fullName}</span>
          )}
        </span>
      ),
    },
    {
      header: 'Source',
      render: (a) => <span className="text-fg-muted">{humanize(a.entrySource)}</span>,
    },
    {
      header: 'Status',
      width: 'w-[120px]',
      render: (a) => <InkStatus domain="appointment" status={a.status} />,
    },
    {
      header: 'Action',
      align: 'right',
      render: (a) => {
        if (a.encounter) {
          return (
            <Link
              href={`/encounters/${a.encounter.id}`}
              className="text-[13px] font-medium text-primary hover:text-primary-hover"
            >
              Open visit
            </Link>
          );
        }
        if (canCheckIn && (a.status === 'REQUESTED' || a.status === 'CONFIRMED')) {
          return (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setCheckIn({
                  appointmentId: a.id,
                  patientId: a.patient.id,
                  patientName: fullName(a.patient),
                  dateOfBirth: a.patient.dateOfBirth,
                  phone: a.patient.phone,
                  scheduledAt: a.scheduledAt,
                  doctorName: a.doctor?.fullName,
                  entrySource: a.entrySource,
                })
              }
            >
              Check in
            </Button>
          );
        }
        return null;
      },
    },
  ];

  const today = clinicToday();
  const todays = data?.filter(
    (a) =>
      a.scheduledAt &&
      new Date(a.scheduledAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today,
  );
  const sorted = data && [...data].sort((x, y) => y.scheduledAt.localeCompare(x.scheduledAt));
  const countToday = (statuses: string[]) =>
    todays?.filter((a) => statuses.includes(a.status)).length;

  const head = (
    <SheetHead
      eyebrow={formatLongDate(new Date())}
      title="Consultations"
      description={
        canCheckIn
          ? "Register patients, book appointments and open a patient's visit."
          : "Today's consultations. Open a visit once the front desk has checked the patient in."
      }
      figures={
        canReadAppointments ? (
          <Figures
            loading={loading && !data}
            items={[
              { label: 'Today', value: todays?.length },
              { label: 'Still to come', value: countToday(['REQUESTED', 'CONFIRMED']) },
              { label: 'In the clinic', value: countToday(['CHECKED_IN', 'IN_PROGRESS']) },
              { label: 'Completed', value: countToday(['COMPLETED']) },
            ]}
          />
        ) : undefined
      }
      action={
        can(user.role, 'patient:write') ? (
          <Link
            href="/claims"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-control bg-surface px-3.5 text-[13px] font-medium text-fg hover:bg-surface-muted"
          >
            <IdentificationCard size={16} aria-hidden="true" />
            Patient claims
          </Link>
        ) : undefined
      }
    />
  );

  if (!canReadAppointments) {
    return (
      <InkSheet>
        {head}
        <EmptyState
          icon={Stethoscope}
          title="Open a visit from the queue"
          description="Patients appear in your queue once they are checked in. Open a patient there to start the consultation."
          action={
            <Link
              href="/queue"
              className="inline-flex h-9 items-center rounded-control bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              Go to queue
            </Link>
          }
        />
      </InkSheet>
    );
  }

  return (
    <>
      <InkSheet>
        {head}
        {formError && (
          <p
            role="alert"
            className="border-b border-line bg-danger-bg px-8 py-2.5 text-sm text-danger-fg"
          >
            {formError}
          </p>
        )}
        <div
          className={`grid grid-cols-1 ${canWriteAppointments ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : ''}`}
        >
          <section aria-label="Appointments" className="min-w-0">
            <div className="flex min-h-11 items-center justify-between gap-4 border-b border-line px-5 py-2 sm:px-8">
              <h2 className="text-[14px] font-semibold text-fg">Appointments</h2>
              <span className="text-[12px] text-fg-muted">
                {data ? (
                  <>
                    <span className="tabular font-mono text-fg">{data.length}</span> on record,
                    newest first
                  </>
                ) : null}
              </span>
            </div>
            {errorStatus !== undefined && !data ? (
              <div role="alert" className="flex items-center justify-between gap-4 px-8 py-5">
                <p className="text-sm text-danger-fg">Could not load appointments.</p>
                <Button variant="secondary" size="sm" onClick={reload}>
                  Retry
                </Button>
              </div>
            ) : (
              <LedgerTable
                columns={columns}
                rows={sorted}
                getRowKey={(a) => a.id}
                loading={loading}
                muted={(a) =>
                  a.status === 'COMPLETED' || a.status === 'CANCELLED' || a.status === 'NO_SHOW'
                }
                minWidth={720}
                caption="Appointments"
                empty={
                  <EmptyState
                    icon={CalendarBlank}
                    title="No appointments yet"
                    description={
                      canWriteAppointments
                        ? 'Book the first appointment in the rail and it will appear here.'
                        : 'Appointments booked at the front desk appear here.'
                    }
                  />
                }
              />
            )}
          </section>

          {canWriteAppointments && (
            <SheetRail label="Book an appointment">
              <InkSection title="New appointment">
                <MarginNote className="pt-1">
                  Pick a patient, or register a new one, then choose a time.
                </MarginNote>
                <form
                  onSubmit={appointmentForm.handleSubmit(onCreateAppointment)}
                  onChange={(event) => {
                    clearAppointmentEdit(event);
                    clearPatientEdit(event);
                  }}
                  className="flex flex-col gap-4 pt-3"
                  noValidate
                >
                  <div className="flex flex-col gap-2">
                    <div className="min-w-0">
                      <PatientPicker
                        value={selectedPatient}
                        onChange={(patient) => {
                          setSelectedPatient(patient);
                          appointmentForm.setValue('patientId', patient?.id ?? '', {
                            shouldValidate: true,
                          });
                        }}
                        error={appointmentForm.formState.errors.patientId?.message}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      icon={<UserPlus size={20} aria-hidden="true" />}
                      onClick={() => {
                        setShowRegisterPatient((prev) => !prev);
                        setRegisterOutcome(null);
                        setActivationOutcome(null);
                      }}
                    >
                      {showRegisterPatient ? 'Cancel' : 'New patient'}
                    </Button>
                  </div>

                  {showRegisterPatient && !registerOutcome && (
                    <div
                      className="border-y border-line py-4"
                      onKeyDown={(event) => {
                        // Enter here registers the patient, not the whole appointment.
                        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                          event.preventDefault();
                          void patientForm.handleSubmit(onRegisterPatient)();
                        }
                      }}
                    >
                      <div className="grid grid-cols-1 gap-4">
                        <Field
                          label="First name"
                          htmlFor="reg-first-name"
                          error={patientForm.formState.errors.firstName?.message}
                        >
                          <Input
                            id="reg-first-name"
                            required
                            aria-required="true"
                            aria-invalid={patientForm.formState.errors.firstName ? true : undefined}
                            {...patientForm.register('firstName')}
                          />
                        </Field>
                        <Field
                          label="Last name"
                          htmlFor="reg-last-name"
                          error={patientForm.formState.errors.lastName?.message}
                        >
                          <Input
                            id="reg-last-name"
                            required
                            aria-required="true"
                            aria-invalid={patientForm.formState.errors.lastName ? true : undefined}
                            {...patientForm.register('lastName')}
                          />
                        </Field>
                        <Field
                          label="Date of birth"
                          htmlFor="reg-dob"
                          error={patientForm.formState.errors.dateOfBirth?.message}
                        >
                          <Input
                            id="reg-dob"
                            type="date"
                            min="1900-01-01"
                            max={clinicToday()}
                            required
                            aria-required="true"
                            aria-invalid={
                              patientForm.formState.errors.dateOfBirth ? true : undefined
                            }
                            {...patientForm.register('dateOfBirth')}
                          />
                        </Field>
                        <Field
                          label="Phone"
                          htmlFor="reg-phone"
                          error={patientForm.formState.errors.phone?.message}
                        >
                          <Input
                            id="reg-phone"
                            required
                            aria-required="true"
                            aria-invalid={patientForm.formState.errors.phone ? true : undefined}
                            {...patientForm.register('phone')}
                          />
                        </Field>
                      </div>
                      <Button
                        type="button"
                        className="mt-4"
                        onClick={patientForm.handleSubmit(onRegisterPatient)}
                        loading={patientForm.formState.isSubmitting}
                      >
                        Register patient
                      </Button>
                    </div>
                  )}

                  {/* PatientsService.register's non-`created` outcomes: the
                  backend found something Reception should look at before
                  any record is created. */}
                  {registerOutcome && registerOutcome.kind === 'existing' && (
                    <MatchPanel title="Existing patient found">
                      <PatientLine patient={registerOutcome.patient} />
                      <p className="mt-2 text-[13px] text-fg-muted">
                        {registerOutcome.hasAccount
                          ? 'This patient already has an online account. They can sign in directly.'
                          : 'This patient does not have an online account yet.'}
                      </p>

                      {activationOutcome && activationOutcome.kind === 'created' && (
                        <p className="mt-2 rounded-control bg-surface px-3 py-2 text-sm text-fg">
                          Activation code:{' '}
                          <span className="font-mono font-semibold">{activationOutcome.code}</span>.
                          Share this with the patient. Expires{' '}
                          {formatDate(activationOutcome.expiresAt)}{' '}
                          {formatTime(activationOutcome.expiresAt)}.
                        </p>
                      )}
                      {activationOutcome && activationOutcome.kind === 'duplicate_account' && (
                        <p className="mt-2 text-[13px] text-fg-muted">
                          This patient already has an account, so no new code was created.
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => selectPatient(registerOutcome.patient)}
                        >
                          Open patient record
                        </Button>
                        {!registerOutcome.hasAccount && !activationOutcome && (
                          <Button
                            variant="secondary"
                            disabled={claimBusy}
                            onClick={() => handleSendActivation(registerOutcome.patient.id)}
                          >
                            Send account activation
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setRegisterOutcome(null);
                            setActivationOutcome(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </MatchPanel>
                  )}

                  {registerOutcome &&
                    (registerOutcome.kind === 'possible_match' ||
                      registerOutcome.kind === 'ambiguous_match') && (
                      <MatchPanel
                        title={
                          registerOutcome.kind === 'possible_match'
                            ? 'Possible existing patient found'
                            : 'Multiple possible patients found'
                        }
                      >
                        <ul className="flex flex-col gap-2">
                          {registerOutcome.candidates.map((candidate) => {
                            const claimRequestId = registerOutcome.claimRequestId;
                            return (
                              <li key={candidate.id} className="border-b border-line py-3">
                                <PatientLine patient={candidate} />
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="mt-2"
                                  disabled={claimBusy}
                                  onClick={() =>
                                    handleConfirmSamePatient(claimRequestId, candidate.id)
                                  }
                                >
                                  This is the same patient
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            disabled={claimBusy}
                            onClick={() => handleCreateNewFromClaim(registerOutcome.claimRequestId)}
                          >
                            None of these, create new patient
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={claimBusy}
                            onClick={() => handleEscalateClaim(registerOutcome.claimRequestId)}
                          >
                            Escalate
                          </Button>
                          <Button variant="ghost" onClick={() => setRegisterOutcome(null)}>
                            Cancel
                          </Button>
                        </div>
                      </MatchPanel>
                    )}

                  <div className="grid grid-cols-1 gap-4">
                    <Field
                      label="Entry source"
                      htmlFor="appt-source"
                      error={
                        appointmentForm.formState.errors.entrySource && 'Choose an entry source.'
                      }
                    >
                      <Select
                        id="appt-source"
                        required
                        aria-required="true"
                        {...appointmentForm.register('entrySource')}
                      >
                        {Object.values(AppointmentEntrySource).map((source) => (
                          <option key={source} value={source}>
                            {humanize(source)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Scheduled at"
                      htmlFor="appt-scheduled"
                      error={appointmentForm.formState.errors.scheduledAt?.message}
                    >
                      <Input
                        id="appt-scheduled"
                        type="datetime-local"
                        required
                        aria-required="true"
                        aria-invalid={
                          appointmentForm.formState.errors.scheduledAt ? true : undefined
                        }
                        {...appointmentForm.register('scheduledAt')}
                      />
                    </Field>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    loading={appointmentForm.formState.isSubmitting}
                  >
                    Book appointment
                  </Button>
                </form>
              </InkSection>
            </SheetRail>
          )}
        </div>
      </InkSheet>

      <CheckInDialog
        target={checkIn}
        onClose={() => setCheckIn(null)}
        onDone={reload}
        onCheckedIn={(encounterId) => router.push(`/encounters/${encounterId}`)}
      />
    </>
  );
}
