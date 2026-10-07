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
import { Card, CardHeader } from '../../../../components/ui/card';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { can } from '../../../../lib/permissions';
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
      className="mt-3 flex flex-col gap-3 border-t border-line pt-3"
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
  onChange,
}: {
  encounterId: string;
  diagnoses: Diagnosis[];
  role: StaffRole | undefined;
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

  return (
    <Card>
      <CardHeader title="Diagnoses" />
      <div className="p-5">
        {diagnoses.length === 0 ? (
          <p className="mb-4 text-sm text-fg-muted">No diagnoses yet.</p>
        ) : (
          <ul className="mb-5 flex flex-col gap-2">
            {diagnoses.map((diagnosis) => {
              const latest = diagnosis.versions[0];
              if (!latest) return null;
              return (
                <li key={diagnosis.id} className="rounded-control bg-surface-muted px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-fg">{latest.description}</span>
                      {latest.icdCode && (
                        <span className="tabular text-xs text-fg-muted">{latest.icdCode}</span>
                      )}
                      {isUnsigned(latest.status) ? (
                        <Badge tone="warning">Draft, not signed</Badge>
                      ) : (
                        <StatusBadge domain="note" status={latest.status} />
                      )}
                    </div>
                    <div className="flex gap-2">
                      {latest.status === 'DRAFT' && can(role, 'diagnosis:sign-off') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirming(diagnosis)}
                        >
                          Sign off
                        </Button>
                      )}
                      {can(role, 'diagnosis:write-draft') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setAmendingId(amendingId === diagnosis.id ? null : diagnosis.id)
                          }
                        >
                          {amendingId === diagnosis.id
                            ? 'Cancel'
                            : latest.status === 'DRAFT'
                              ? 'Edit'
                              : 'Amend'}
                        </Button>
                      )}
                    </div>
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

        {can(role, 'diagnosis:write-draft') && (
          <form
            onSubmit={handleSubmit(onSubmit)}
            onChange={clearOnEditRhf(clearErrors, () => setFormError(null))}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
              <Field
                label="ICD code (optional)"
                htmlFor="dx-icd"
                error={formState.errors.icdCode && 'ICD code can be at most 20 characters.'}
              >
                <Input
                  id="dx-icd"
                  maxLength={20}
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
            </div>
            {formError && (
              <p role="alert" className="text-[13px] text-danger-fg">
                {formError}
              </p>
            )}
            <Button type="submit" loading={formState.isSubmitting} className="self-start">
              Add diagnosis
            </Button>
          </form>
        )}
        {!can(role, 'diagnosis:write-draft') && formError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-fg">
            {formError}
          </p>
        )}
      </div>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Sign off diagnosis"
        description="Signing off finalizes this diagnosis. Later changes are recorded as amendments."
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
    </Card>
  );
}
