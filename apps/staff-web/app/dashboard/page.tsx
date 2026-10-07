'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createAppointmentSchema,
  patientRegistrationSchema,
  type CreateAppointmentInput,
  type PatientRegistrationInput,
} from '@serenemed/validation';
import { AppointmentEntrySource } from '@serenemed/types';
import { Button, Card } from '@serenemed/ui';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { clearStaffSession, getStaffToken, getStaffUser, type StaffUser } from '../../lib/auth';
import { can } from '../../lib/permissions';
import { PatientPicker, type PatientSummary } from './patient-picker';

interface AppointmentRow {
  id: string;
  status: string;
  entrySource: string;
  scheduledAt: string;
  patient: { id: string; firstName: string; lastName: string };
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
 * comment) — the backend, not this form, decides whether this is a new
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

/**
 * The doctor/reception workspace: today's appointments, checking a
 * patient in (which creates the Encounter the clinical workspace at
 * /encounters/[id] operates on), and the two things booking an
 * appointment needs that had no UI at all before this page — picking an
 * existing patient or registering a new one (POST /patients, added
 * alongside this page since there was no way to create a patient
 * outside the dev seed script).
 */
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegisterPatient, setShowRegisterPatient] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [registerOutcome, setRegisterOutcome] = useState<RegisterPatientResult | null>(null);
  const [activationOutcome, setActivationOutcome] = useState<ActivationResult | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);

  // Reused by the event handlers below (post-mutation refresh) — not
  // called directly from the mount effect, which does its own inline
  // fetch instead (see the useEffect below for why). No longer fetches
  // the patient list here — PatientPicker searches on demand instead of
  // this page holding every patient in state.
  const loadData = useCallback(async () => {
    const appointmentsRes = await apiClient.get<AppointmentRow[]>('/appointments');
    setAppointments(appointmentsRes);
  }, []);

  // Deliberately not `loadData()` here — eslint's react-hooks/set-state-in-effect
  // flags calling a named function that (transitively) calls setState
  // from inside an effect, even through a promise chain. An inline
  // `.then()` on the fetch itself (matching
  // patient-web/app/dashboard/page.tsx's proven shape) is what the rule
  // recognizes as a legitimate async data-fetch-on-mount, so the GET
  // call is duplicated here rather than reusing loadData.
  useEffect(() => {
    if (!getStaffToken()) {
      router.replace('/login');
      return;
    }

    apiClient
      .get<AppointmentRow[]>('/appointments')
      .then((appointmentsRes) => {
        setUser(getStaffUser());
        setAppointments(appointmentsRes);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearStaffSession();
          router.replace('/login');
          return;
        }
        setLoadError('Could not load the dashboard. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  // The browser's <input type="datetime-local"> produces a value like
  // "2026-09-22T07:28" — no seconds, no timezone — which
  // createAppointmentSchema's real scheduledAt (z.string().datetime(),
  // enforced again server-side) correctly rejects. Loosen just that one
  // field for the form's own validation; onCreateAppointment converts to
  // a real ISO string via `new Date(...).toISOString()` before it ever
  // reaches the API, which still gets validated against the strict
  // schema there. Caught live by actually submitting this form in a
  // browser, not by typecheck — the two schemas agreed at the type
  // level but not at runtime.
  const appointmentFormSchema = createAppointmentSchema.extend({
    scheduledAt: z.string().min(1, 'Required'),
  });
  const appointmentForm = useForm<z.infer<typeof appointmentFormSchema>>({
    resolver: zodResolver(appointmentFormSchema),
  });
  const patientForm = useForm<PatientRegistrationInput>({
    resolver: zodResolver(patientRegistrationSchema),
  });

  // Picking a patient (however we got there — a genuinely new record, an
  // existing one Reception confirmed, or the claim-resolution endpoints
  // below) always ends the same way: select it for the appointment form
  // and close out any in-progress register/claim UI.
  const selectPatient = (patient: PatientProfile) => {
    setSelectedPatient(patient);
    appointmentForm.setValue('patientId', patient.id, { shouldValidate: true });
    patientForm.reset();
    setShowRegisterPatient(false);
    setRegisterOutcome(null);
    setActivationOutcome(null);
  };

  const onRegisterPatient = async (data: PatientRegistrationInput) => {
    setFormError(null);
    setActivationOutcome(null);
    try {
      const result = await apiClient.post<RegisterPatientResult>('/patients', data);
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
        {
          patientId,
        },
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

  const onCreateAppointment = async (data: CreateAppointmentInput) => {
    setFormError(null);
    try {
      await apiClient.post('/appointments', {
        ...data,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
      });
      appointmentForm.reset();
      setSelectedPatient(null);
      await loadData();
    } catch (error) {
      setFormError(errorMessage(error, 'Could not create the appointment.'));
    }
  };

  const handleCheckIn = async (appointmentId: string) => {
    setCheckingInId(appointmentId);
    setFormError(null);
    try {
      const encounter = await apiClient.post<{ id: string }>(
        `/appointments/${appointmentId}/check-in`,
      );
      router.push(`/encounters/${encounter.id}`);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not check in this appointment.'));
      setCheckingInId(null);
    }
  };

  const handleLogout = () => {
    clearStaffSession();
    router.replace('/login');
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <p className="text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  const canWriteAppointments = can(user?.role, 'appointment:write');

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 bg-slate-50 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          {user && (
            <p className="text-sm text-slate-600">
              {user.fullName} · {user.role.replaceAll('_', ' ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {can(user?.role, 'patient:write') && (
            <a
              href="/claims"
              className="text-sm font-medium text-slate-700 underline underline-offset-2"
            >
              Pending account claims
            </a>
          )}
          <Button variant="secondary" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </header>

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      {canWriteAppointments && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">New appointment</h2>
          <form
            onSubmit={appointmentForm.handleSubmit(onCreateAppointment)}
            className="flex flex-col gap-3"
            noValidate
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[10rem]">
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
                onClick={() => {
                  setShowRegisterPatient((prev) => !prev);
                  setRegisterOutcome(null);
                  setActivationOutcome(null);
                }}
              >
                {showRegisterPatient ? 'Cancel' : '+ New patient'}
              </Button>
            </div>

            {showRegisterPatient && !registerOutcome && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      First name
                    </label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      {...patientForm.register('firstName')}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Last name
                    </label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      {...patientForm.register('lastName')}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Date of birth
                    </label>
                    <input
                      type="date"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      {...patientForm.register('dateOfBirth')}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Phone</label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      {...patientForm.register('phone')}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-3"
                  onClick={patientForm.handleSubmit(onRegisterPatient)}
                  disabled={patientForm.formState.isSubmitting}
                >
                  {patientForm.formState.isSubmitting ? 'Registering…' : 'Register patient'}
                </Button>
              </div>
            )}

            {/* PatientsService.register's non-`created` outcomes — the
                backend found something Reception should look at before
                any record is created; see that method's doc comment. */}
            {registerOutcome && registerOutcome.kind === 'existing' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 text-sm font-semibold text-amber-900">Existing patient found</p>
                <p className="text-sm text-slate-700">
                  {registerOutcome.patient.firstName} {registerOutcome.patient.lastName}
                </p>
                <p className="text-xs text-slate-500">
                  DOB {new Date(registerOutcome.patient.dateOfBirth).toLocaleDateString()} ·{' '}
                  {registerOutcome.patient.phone}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  {registerOutcome.hasAccount
                    ? 'This patient already has an online account. They can sign in directly.'
                    : 'This patient does not have an online account yet.'}
                </p>

                {activationOutcome && activationOutcome.kind === 'created' && (
                  <p className="mt-2 rounded-md bg-white px-3 py-2 text-sm text-slate-900">
                    Activation code:{' '}
                    <span className="font-mono font-semibold">{activationOutcome.code}</span> —
                    share this with the patient. Expires{' '}
                    {new Date(activationOutcome.expiresAt).toLocaleString()}.
                  </p>
                )}
                {activationOutcome && activationOutcome.kind === 'duplicate_account' && (
                  <p className="mt-2 text-xs text-slate-600">
                    This patient already has an account — no new code was created.
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
              </div>
            )}

            {registerOutcome &&
              (registerOutcome.kind === 'possible_match' ||
                registerOutcome.kind === 'ambiguous_match') && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-sm font-semibold text-amber-900">
                    {registerOutcome.kind === 'possible_match'
                      ? 'Possible existing patient found'
                      : 'Multiple possible patients found'}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {registerOutcome.candidates.map((candidate) => {
                      const claimRequestId = registerOutcome.claimRequestId;
                      return (
                        <li
                          key={candidate.id}
                          className="rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700"
                        >
                          <p className="text-slate-900">
                            {candidate.firstName} {candidate.lastName}
                          </p>
                          <p className="text-xs text-slate-500">
                            DOB {new Date(candidate.dateOfBirth).toLocaleDateString()} ·{' '}
                            {candidate.phone}
                          </p>
                          <Button
                            variant="secondary"
                            className="mt-2"
                            disabled={claimBusy}
                            onClick={() => handleConfirmSamePatient(claimRequestId, candidate.id)}
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
                      None of these — create new patient
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
                </div>
              )}

            <div className="flex flex-wrap gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Entry source
                </label>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  {...appointmentForm.register('entrySource')}
                >
                  {Object.values(AppointmentEntrySource).map((source) => (
                    <option key={source} value={source}>
                      {source.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Scheduled at
                </label>
                <input
                  type="datetime-local"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  {...appointmentForm.register('scheduledAt')}
                />
                {appointmentForm.formState.errors.scheduledAt && (
                  <p className="mt-1 text-xs text-red-600">
                    {appointmentForm.formState.errors.scheduledAt.message}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="self-start"
              disabled={appointmentForm.formState.isSubmitting}
            >
              {appointmentForm.formState.isSubmitting ? 'Booking…' : 'Book appointment'}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Appointments</h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-slate-500">No appointments yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Patient</th>
                <th className="py-2 pr-3 font-medium">Scheduled</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-slate-900">
                    {appointment.patient.firstName} {appointment.patient.lastName}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {new Date(appointment.scheduledAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {appointment.entrySource.replaceAll('_', ' ')}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{appointment.status}</td>
                  <td className="py-2">
                    {appointment.encounter ? (
                      <a
                        href={`/encounters/${appointment.encounter.id}`}
                        className="text-sm font-medium text-slate-900 underline"
                      >
                        Open
                      </a>
                    ) : canWriteAppointments &&
                      (appointment.status === 'REQUESTED' || appointment.status === 'CONFIRMED') ? (
                      <Button
                        variant="secondary"
                        onClick={() => handleCheckIn(appointment.id)}
                        disabled={checkingInId === appointment.id}
                      >
                        {checkingInId === appointment.id ? 'Checking in…' : 'Check in'}
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
