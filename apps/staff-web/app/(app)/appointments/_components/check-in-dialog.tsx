'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { Avatar } from '../../../../components/ui/avatar';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Select, Textarea } from '../../../../components/ui/fields';
import { ageLabel } from '../../patients/_components/patient-shared';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, humanize } from '../../../../lib/format';

export interface CheckInTarget {
  appointmentId: string;
  patientId: string;
  patientName: string;
  /** Second identifier, read back to the patient before checking in. */
  dateOfBirth?: string;
  phone?: string;
  /** What was booked, so a wrong row is obvious. */
  scheduledAt?: string;
  doctorName?: string | null;
  entrySource?: string;
  /** Set when the patient is already checked in but not yet in the queue. */
  encounterId?: string;
}

interface Issued {
  tokenNumber: number;
  station: string;
  encounterId: string;
}

const VISIT_TYPES = ['NEW_CONSULTATION', 'FOLLOW_UP', 'REPORT_REVIEW', 'PROCEDURE'] as const;

/**
 * Front desk check-in: opens the visit and registers it in one go, which
 * issues the patient's queue token and sends them to Vitals. If check-in
 * succeeded but registration failed, the appointment row offers
 * "Add to queue", which reopens this dialog for the registration step only.
 * Consent to treatment is confirmed here and recorded on the patient's
 * record once the token is issued. `onCheckedIn` (optional) receives the
 * encounter id when the user presses Done, for desks that go straight
 * into the visit.
 */
export function CheckInDialog({
  target,
  onClose,
  onDone,
  onCheckedIn,
}: {
  target: CheckInTarget | null;
  onClose: () => void;
  onDone: () => void;
  onCheckedIn?: (encounterId: string) => void;
}) {
  const [visitType, setVisitType] = useState<string>('NEW_CONSULTATION');
  const [route, setRoute] = useState<'JUNIOR_ASSESSMENT' | 'DIRECT_SENIOR'>('JUNIOR_ASSESSMENT');
  const [idChecked, setIdChecked] = useState(false);
  const [consented, setConsented] = useState(false);
  const [screening, setScreening] = useState(false);
  const [notes, setNotes] = useState('');
  const [idError, setIdError] = useState<string>();
  const [consentError, setConsentError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued>();
  const [consentWarning, setConsentWarning] = useState(false);
  // Kept when check-in worked but registration failed, so a retry doesn't check in twice.
  const [openedEncounterId, setOpenedEncounterId] = useState<string>();

  const reset = () => {
    setVisitType('NEW_CONSULTATION');
    setRoute('JUNIOR_ASSESSMENT');
    setIdChecked(false);
    setConsented(false);
    setScreening(false);
    setNotes('');
    setIdError(undefined);
    setConsentError(undefined);
    setError(undefined);
    setIssued(undefined);
    setConsentWarning(false);
    setOpenedEncounterId(undefined);
  };

  const close = () => {
    if (busy) return;
    const done = issued;
    reset();
    onClose();
    if (done) {
      onDone();
      onCheckedIn?.(done.encounterId);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    if (!idChecked || !consented) {
      if (!idChecked) setIdError("Check the patient's ID before adding them to the queue.");
      if (!consented)
        setConsentError('Confirm the patient has given consent to treatment before checking in.');
      document.getElementById(!idChecked ? 'checkin-id' : 'checkin-consent')?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      let encounterId = target.encounterId ?? openedEncounterId;
      if (!encounterId) {
        const encounter = await apiClient.post<{ id: string }>(
          `/appointments/${target.appointmentId}/check-in`,
        );
        encounterId = encounter.id;
        setOpenedEncounterId(encounterId);
      }
      const result = await apiClient.post<{ queueEntry: Issued }>(
        `/encounters/${encounterId}/registration`,
        {
          visitType,
          consultationRoute: route,
          idProofVerified: true,
          cancerScreeningRequired: screening,
          notes: notes.trim() || undefined,
        },
      );
      setIssued({ ...result.queueEntry, encounterId });
      // The visit is open and the token issued; consent is recorded on the
      // patient's record. If that fails the check-in still stands.
      try {
        await apiClient.post('/patient-consent', {
          patientId: target.patientId,
          consentType: 'TREATMENT',
          action: 'GRANTED',
        });
      } catch {
        setConsentWarning(true);
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'This visit is already checked in or in the queue. The list has been refreshed.'
          : 'Check-in did not go through. Please try again.',
      );
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      title={issued ? 'Added to the queue' : 'Check in'}
      description={target?.patientName}
      footer={
        issued ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="checkin-form" loading={busy}>
              {target?.encounterId || openedEncounterId ? 'Add to queue' : 'Check in'}
            </Button>
          </>
        )
      }
    >
      {issued ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle size={40} weight="fill" className="text-success-fg" aria-hidden="true" />
          <p className="text-sm text-fg-muted">Token</p>
          <p className="tabular font-mono text-4xl font-semibold tracking-tight text-fg">
            {String(issued.tokenNumber).padStart(3, '0')}
          </p>
          <p className="text-sm text-fg-muted">
            Please ask {target?.patientName} to wait for {humanize(issued.station)}.
          </p>
          {consentWarning && (
            <p
              role="alert"
              className="mt-2 rounded-control bg-warning-bg px-3 py-2 text-left text-sm text-warning-fg"
            >
              Checked in, but consent was not recorded. Record it on the patient&apos;s Consent tab.
            </p>
          )}
        </div>
      ) : (
        <form id="checkin-form" noValidate onSubmit={submit} className="flex flex-col gap-5">
          {target && <WhoIsCheckingIn target={target} />}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Visit type *" htmlFor="checkin-type">
              <Select
                id="checkin-type"
                value={visitType}
                onChange={(e) => setVisitType(e.target.value)}
              >
                {VISIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seen first by *" htmlFor="checkin-route">
              <Select
                id="checkin-route"
                value={route}
                onChange={(e) => setRoute(e.target.value as typeof route)}
              >
                <option value="JUNIOR_ASSESSMENT">Junior doctor, then senior</option>
                <option value="DIRECT_SENIOR">Senior doctor directly</option>
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-3 rounded-control bg-surface-muted px-4 py-4">
            <label htmlFor="checkin-id" className="flex cursor-pointer items-start gap-3">
              <input
                id="checkin-id"
                type="checkbox"
                checked={idChecked}
                aria-required="true"
                aria-invalid={idError ? true : undefined}
                aria-describedby={idError ? 'checkin-id-error' : undefined}
                onChange={(e) => {
                  setIdChecked(e.target.checked);
                  setIdError(undefined);
                }}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
              />
              <span className="text-sm text-fg">
                I have checked the patient&apos;s photo ID
                <span aria-hidden="true" className="ml-0.5 text-danger-fg">
                  *
                </span>
              </span>
            </label>
            {idError && (
              <p id="checkin-id-error" role="alert" className="text-[13px] text-danger-fg">
                {idError}
              </p>
            )}
            <label htmlFor="checkin-consent" className="flex cursor-pointer items-start gap-3">
              <input
                id="checkin-consent"
                type="checkbox"
                checked={consented}
                aria-required="true"
                aria-invalid={consentError ? true : undefined}
                aria-describedby={consentError ? 'checkin-consent-error' : undefined}
                onChange={(e) => {
                  setConsented(e.target.checked);
                  setConsentError(undefined);
                }}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
              />
              <span className="text-sm text-fg">
                The patient has given consent to treatment
                <span aria-hidden="true" className="ml-0.5 text-danger-fg">
                  *
                </span>
              </span>
            </label>
            {consentError && (
              <p id="checkin-consent-error" role="alert" className="text-[13px] text-danger-fg">
                {consentError}
              </p>
            )}
            <label htmlFor="checkin-screening" className="flex cursor-pointer items-start gap-3">
              <input
                id="checkin-screening"
                type="checkbox"
                checked={screening}
                onChange={(e) => setScreening(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
              />
              <span className="text-sm text-fg">Cancer screening needed at this visit</span>
            </label>
          </div>

          <Field label="Note for the clinical team (optional)" htmlFor="checkin-notes">
            <Textarea
              id="checkin-notes"
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </Dialog>
  );
}

/**
 * The patient and booking being checked in, with two identifiers (design
 * system 8.2) so the desk confirms the right person before a token is
 * issued. A wrong row here sends a stranger's token to the patient.
 */
function WhoIsCheckingIn({ target }: { target: CheckInTarget }) {
  return (
    <div className="rounded-control border border-line bg-surface-muted px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={target.patientName} size={40} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-fg">{target.patientName}</p>
          <p className="tabular text-[13px] text-fg-muted">
            {target.dateOfBirth
              ? `Born ${formatDate(target.dateOfBirth)} (${ageLabel(target.dateOfBirth)})`
              : 'Date of birth not on file'}
            {target.phone ? ` · ${target.phone}` : ''}
          </p>
        </div>
      </div>
      {target.scheduledAt && (
        <p className="mt-3 border-t border-line pt-3 text-[13px] text-fg-muted">
          Booked for{' '}
          <span className="tabular font-medium text-fg">{formatTime(target.scheduledAt)}</span>
          {target.doctorName ? ` with ${target.doctorName}` : ''}
          {target.entrySource ? ` · ${humanize(target.entrySource)}` : ''}
        </p>
      )}
      <p className="mt-2 text-[13px] font-medium text-fg">
        Ask the patient to confirm their name and date of birth.
      </p>
    </div>
  );
}
