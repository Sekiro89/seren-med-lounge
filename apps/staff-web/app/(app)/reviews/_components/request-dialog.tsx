'use client';

import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { PatientPicker, type PatientOption } from './patient-picker';
import { STAGES, messageOf } from './helpers';

type Stage = (typeof STAGES)[number]['value'];

export function RequestDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [patient, setPatient] = useState<PatientOption>();
  const [stage, setStage] = useState<Stage>('AFTER_SECOND_CONSULTATION');
  const [procedureId, setProcedureId] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const hint = STAGES.find((s) => s.value === stage)?.hint;

  const close = () => {
    setPatient(undefined);
    setStage('AFTER_SECOND_CONSULTATION');
    setProcedureId('');
    setError(undefined);
    onClose();
  };

  const submit = async () => {
    if (!patient) return setError('Choose a patient.');
    if (stage === 'AFTER_PROCEDURE' && !procedureId.trim()) {
      return setError('Enter the procedure id.');
    }
    setSaving(true);
    setError(undefined);
    try {
      await apiClient.post('/review-requests', {
        patientId: patient.id,
        stage,
        ...(stage === 'AFTER_PROCEDURE' ? { procedureId: procedureId.trim() } : {}),
      });
      onSaved();
      close();
    } catch (e) {
      setError(messageOf(e, 'The request could not be sent. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Request a review"
      description="Ask a patient to rate their care."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={saving} onClick={submit}>
            Send request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Field label="Patient *" htmlFor="review-patient">
          <PatientPicker id="review-patient" value={patient} onChange={setPatient} />
        </Field>
        <Field label="Stage" htmlFor="review-stage" helper={hint}>
          <Select
            id="review-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        {stage === 'AFTER_PROCEDURE' && (
          <Field label="Procedure id" htmlFor="review-procedure">
            <Input
              id="review-procedure"
              value={procedureId}
              onChange={(e) => setProcedureId(e.target.value)}
              autoComplete="off"
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
