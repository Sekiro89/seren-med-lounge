'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createDiagnosisDraftSchema,
  diagnosisContentSchema,
  type CreateDiagnosisDraftInput,
  type DiagnosisContentInput,
} from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Badge, StatusBadge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { can } from '../../../../lib/permissions';
import { LinkButton } from './document';
import { apiErrorMessage, isUnsigned, type Diagnosis } from './types';
import { clearOnEditRhf } from '../../../../lib/forms';

const DESCRIPTION_MAX = 2000;

/** Whitespace alone is not a description, so trim before the schema sees it. */
const trimmed = (value: string | undefined) => (value === undefined ? value : value.trim());
const trimValue = (value: string) => (typeof value === 'string' ? value.trim() : value);

function descriptionError(error: { type?: string } | undefined): string | undefined {
  if (!error) return undefined;
  return error.type === 'too_big'
    ? `Description can be at most ${DESCRIPTION_MAX} characters.`
    : 'Enter a diagnosis description.';
}

function AmendForm({ diagnosisId, onDone }: { diagnosisId: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, clearErrors, formState } = useForm<DiagnosisContentInput>({
    resolver: zodResolver(diagnosisContentSchema),
    reValidateMode: 'onSubmit',
    defaultValues: { icdCode: '', description: '' },
  });

  const onSubmit = async (data: DiagnosisContentInput) => {
    setError(null);
    try {
      await apiClient.post(`/diagnoses/${diagnosisId}/amend`, {
        description: data.description.trim(),
        icdCode: trimmed(data.icdCode) || undefined,
      });
      onDone();
    } catch (submitError) {
      setError(apiErrorMessage(submitError, 'Could not amend this diagnosis.'));
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onChange={clearOnEditRhf(clearErrors, () => setError(null))}
      className="mt-3 flex flex-col gap-3 pb-1"
      noValidate
    >
      <Field
        label="ICD code (optional)"
        htmlFor={`amend-icd-${diagnosisId}`}
        error={formState.errors.icdCode && 'ICD code can be at most 20 characters.'}
      >
        <Input
          id={`amend-icd-${diagnosisId}`}
          maxLength={20}
          aria-invalid={formState.errors.icdCode ? true : undefined}
          {...register('icdCode', { setValueAs: trimValue })}
        />
      </Field>
      <Field
        label="Corrected description"
        htmlFor={`amend-desc-${diagnosisId}`}
        error={descriptionError(formState.errors.description)}
      >
        <Textarea
          id={`amend-desc-${diagnosisId}`}
          required
          aria-required="true"
          maxLength={2000}
          aria-invalid={formState.errors.description ? true : undefined}
          {...register('description', { setValueAs: trimValue })}
        />
      </Field>
      {error && (
        <p role="alert" className="text-[13px] text-danger-fg">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="secondary"
        className="self-start"
        loading={formState.isSubmitting}
      >
        Save amendment
      </Button>
    </form>
  );
}

export function DiagnosesSection({
  encounterId,
  diagnoses,
  role,
  patientName,
  onChange,
}: {
  encounterId: string;
  diagnoses: Diagnosis[];
  role: StaffRole | undefined;
  patientName: string;
  onChange: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [amendingId, setAmendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Diagnosis | null>(null);
  const [signingOff, setSigningOff] = useState(false);

  const { register, handleSubmit, reset, clearErrors, formState } =
    useForm<CreateDiagnosisDraftInput>({
      resolver: zodResolver(createDiagnosisDraftSchema),
      reValidateMode: 'onSubmit',
      defaultValues: { encounterId, icdCode: '', description: '' },
    });

  const onSubmit = async (data: CreateDiagnosisDraftInput) => {
    setFormError(null);
    try {
      await apiClient.post('/diagnoses', {
        encounterId,
        description: data.description.trim(),
        icdCode: trimmed(data.icdCode) || undefined,
      });
      reset({ encounterId, icdCode: '', description: '' });
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not create the diagnosis.'));
    }
  };

  const signOff = async (diagnosis: Diagnosis) => {
    setSigningOff(true);
    setFormError(null);
    try {
      await apiClient.post(`/diagnoses/${diagnosis.id}/sign-off`);
      setConfirming(null);
      onChange();
    } catch (error) {
      setConfirming(null);
      setFormError(apiErrorMessage(error, 'Could not sign off this diagnosis.'));
    } finally {
      setSigningOff(false);
    }
  };

  const confirmingLatest = confirming?.versions[0];
  const canWrite = can(role, 'diagnosis:write-draft');

  return (
    <div className="pl-6">
      {diagnoses.length === 0 ? (
        <p className="py-1 text-[15px] text-fg-subtle">No diagnosis recorded.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line border-y border-line">
          {diagnoses.map((diagnosis) => {
            const latest = diagnosis.versions[0];
            if (!latest) return null;
            return (
              <li key={diagnosis.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {latest.icdCode && (
                    <span className="rounded-control border border-fg px-1.5 font-mono text-[13px] tabular text-fg">
                      {latest.icdCode}
                    </span>
                  )}
                  <span className="text-[15px] font-medium text-fg">{latest.description}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-1">
                    {isUnsigned(latest.status) ? (
                      <Badge tone="warning">Unsigned draft</Badge>
                    ) : (
                      <StatusBadge domain="note" status={latest.status} />
                    )}
                    {latest.status === 'DRAFT' && can(role, 'diagnosis:sign-off') && (
                      <LinkButton onClick={() => setConfirming(diagnosis)}>Sign off</LinkButton>
                    )}
                    {canWrite && (
                      <LinkButton
                        tone="muted"
                        onClick={() =>
                          setAmendingId(amendingId === diagnosis.id ? null : diagnosis.id)
                        }
                      >
                        {amendingId === diagnosis.id
                          ? 'Cancel'
                          : latest.status === 'DRAFT'
                            ? 'Edit'
                            : 'Amend'}
                      </LinkButton>
                    )}
                  </span>
                </div>
                {amendingId === diagnosis.id && (
                  <AmendForm
                    diagnosisId={diagnosis.id}
                    onDone={() => {
                      setAmendingId(null);
                      onChange();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          onChange={clearOnEditRhf(clearErrors, () => setFormError(null))}
          className="mt-4 flex flex-col gap-3"
          noValidate
        >
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]">
            <Field
              label="ICD code (optional)"
              htmlFor="dx-icd"
              error={formState.errors.icdCode && 'ICD code can be at most 20 characters.'}
            >
              <Input
                id="dx-icd"
                maxLength={20}
                className="font-mono"
                aria-invalid={formState.errors.icdCode ? true : undefined}
                {...register('icdCode', { setValueAs: trimValue })}
              />
            </Field>
            <Field
              label="Diagnosis description"
              htmlFor="dx-description"
              error={descriptionError(formState.errors.description)}
            >
              <Input
                id="dx-description"
                required
                aria-required="true"
                maxLength={DESCRIPTION_MAX}
                aria-invalid={formState.errors.description ? true : undefined}
                {...register('description', { setValueAs: trimValue })}
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              loading={formState.isSubmitting}
              className="sm:mt-7"
            >
              Add diagnosis
            </Button>
          </div>
          {formError && (
            <p role="alert" className="text-[13px] text-danger-fg">
              {formError}
            </p>
          )}
        </form>
      )}
      {!canWrite && formError && (
        <p role="alert" className="mt-3 text-[13px] text-danger-fg">
          {formError}
        </p>
      )}

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Sign off diagnosis"
        description={`Signing off finalizes this diagnosis for ${patientName}. Later changes are recorded as amendments.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Keep as draft
            </Button>
            <Button loading={signingOff} onClick={() => confirming && signOff(confirming)}>
              Sign off diagnosis
            </Button>
          </>
        }
      >
        {confirmingLatest && (
          <p className="text-sm text-fg">
            <span className="font-medium">{confirmingLatest.description}</span>
            {confirmingLatest.icdCode ? ` (${confirmingLatest.icdCode})` : ''}
          </p>
        )}
      </Dialog>
    </div>
  );
}
