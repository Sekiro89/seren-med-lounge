'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { createProcedureSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { messageOf, rupeesToPaise } from './helpers';
import { PatientPicker, type PatientOption } from './patient-picker';

interface VisitRow {
  id: string;
  scheduledAt: string;
  patient: { id: string };
  encounter: { id: string } | null;
  doctor: { fullName: string } | null;
}

/**
 * There is no endpoint that lists a patient's encounters, so the open visits
 * come from GET /appointments rows that already carry an encounter.
 */
export function PlanProcedureDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return open ? <PlanForm onClose={onClose} onSaved={onSaved} /> : null;
}

function PlanForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const user = useStaff();
  const canSurgery = can(user.role, 'surgery:manage');
  const [patient, setPatient] = useState<PatientOption>();
  const [encounterId, setEncounterId] = useState('');
  const [kind, setKind] = useState('PROCEDURE');
  const [name, setName] = useState('');
  const [estimate, setEstimate] = useState('');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const visits = useApi<VisitRow[]>(patient ? '/appointments' : null);
  const patientVisits = useMemo(
    () =>
      (visits.data ?? []).filter((v) => v.patient.id === patient?.id && v.encounter).slice(0, 8),
    [visits.data, patient],
  );

  const choosePatient = (p: PatientOption | undefined) => {
    setPatient(p);
    setEncounterId('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!patient) return setError('Choose the patient first.');
    const chosen =
      encounterId || (patientVisits.length === 1 ? patientVisits[0]!.encounter!.id : '');
    if (!chosen) return setError('Choose the visit this procedure belongs to.');
    const estimateMinor = rupeesToPaise(estimate);
    if (Number.isNaN(estimateMinor)) return setError('Enter the estimate as a number of rupees.');
    const items = checklist
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = createProcedureSchema.safeParse({
      encounterId: chosen,
      kind,
      name: name.trim(),
      notes: notes.trim() || undefined,
      estimateMinor,
      checklist: items.length ? items : undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form.');
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post('/procedures', parsed.data);
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'The procedure was not saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Plan procedure"
      description="Record what is planned. You can schedule it after the consent and checklist are ready."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="plan-procedure-form" loading={busy}>
            Plan procedure
          </Button>
        </>
      }
    >
      <form id="plan-procedure-form" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Patient" htmlFor="pp-patient">
          <PatientPicker id="pp-patient" value={patient} onChange={choosePatient} />
        </Field>
        {patient && (
          <Field
            label="Visit"
            htmlFor="pp-visit"
            helper={
              visits.loading
                ? 'Looking for this patient’s visits.'
                : visits.errorStatus !== undefined
                  ? 'The visits could not be loaded, so a procedure cannot be planned from here.'
                  : patientVisits.length === 0
                    ? 'This patient has no checked-in visit. Check them in from Appointments first.'
                    : undefined
            }
          >
            <Select
              id="pp-visit"
              value={
                encounterId || (patientVisits.length === 1 ? patientVisits[0]!.encounter!.id : '')
              }
              onChange={(e) => setEncounterId(e.target.value)}
              disabled={patientVisits.length === 0}
            >
              <option value="">Choose a visit</option>
              {patientVisits.map((v) => (
                <option key={v.id} value={v.encounter!.id}>
                  {formatDate(v.scheduledAt)} {formatTime(v.scheduledAt)}
                  {v.doctor ? `, ${v.doctor.fullName}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Type" htmlFor="pp-kind">
          <Select id="pp-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="PROCEDURE">Procedure</option>
            {canSurgery && <option value="SURGERY">Surgery</option>}
          </Select>
        </Field>
        <Field label="Name" htmlFor="pp-name">
          <Input
            id="pp-name"
            value={name}
            maxLength={300}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Estimate in rupees (optional)" htmlFor="pp-estimate">
          <Input
            id="pp-estimate"
            inputMode="decimal"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </Field>
        <Field
          label="Pre-op checklist (optional)"
          htmlFor="pp-checklist"
          helper="One item per line. You can add more later."
        >
          <Textarea
            id="pp-checklist"
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor="pp-notes">
          <Textarea
            id="pp-notes"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
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
