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
import { Button, Card } from '@serenemed/ui';
import { apiClient } from '../../../lib/api-client';
import { can } from '../../../lib/permissions';
import { apiErrorMessage, type Diagnosis } from './types';

function AmendForm({ diagnosisId, onDone }: { diagnosisId: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<DiagnosisContentInput>({
    resolver: zodResolver(diagnosisContentSchema),
  });

  const onSubmit = async (data: DiagnosisContentInput) => {
    setError(null);
    try {
      await apiClient.post(`/diagnoses/${diagnosisId}/amend`, data);
      onDone();
    } catch (submitError) {
      setError(apiErrorMessage(submitError, 'Could not amend this diagnosis.'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2 flex flex-col gap-2" noValidate>
      <input
        placeholder="ICD code (optional)"
        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        {...register('icdCode')}
      />
      <textarea
        placeholder="Corrected description"
        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        {...register('description')}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button type="submit" variant="secondary" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Saving…' : 'Save amendment'}
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
  const [signingOffId, setSigningOffId] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState } = useForm<CreateDiagnosisDraftInput>({
    resolver: zodResolver(createDiagnosisDraftSchema),
    defaultValues: { encounterId },
  });

  const onSubmit = async (data: CreateDiagnosisDraftInput) => {
    setFormError(null);
    try {
      await apiClient.post('/diagnoses', { ...data, encounterId });
      reset({ encounterId });
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not create the diagnosis.'));
    }
  };

  const signOff = async (diagnosisId: string) => {
    setSigningOffId(diagnosisId);
    setFormError(null);
    try {
      await apiClient.post(`/diagnoses/${diagnosisId}/sign-off`);
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not sign off this diagnosis.'));
    } finally {
      setSigningOffId(null);
    }
  };

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Diagnoses</h2>
      {diagnoses.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No diagnoses yet.</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {diagnoses.map((diagnosis) => {
            const latest = diagnosis.versions[0];
            return (
              <li key={diagnosis.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-slate-900">{latest.description}</span>
                    {latest.icdCode && (
                      <span className="ml-2 text-xs text-slate-500">{latest.icdCode}</span>
                    )}
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                      {latest.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {latest.status === 'DRAFT' && can(role, 'diagnosis:sign-off') && (
                      <Button
                        variant="secondary"
                        onClick={() => signOff(diagnosis.id)}
                        disabled={signingOffId === diagnosis.id}
                      >
                        {signingOffId === diagnosis.id ? 'Signing off…' : 'Sign off'}
                      </Button>
                    )}
                    {(latest.status === 'FINALIZED' || latest.status === 'AMENDED') &&
                      can(role, 'diagnosis:write-draft') && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setAmendingId(amendingId === diagnosis.id ? null : diagnosis.id)
                          }
                        >
                          {amendingId === diagnosis.id ? 'Cancel' : 'Amend'}
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2" noValidate>
          <div className="flex gap-2">
            <input
              placeholder="ICD code (optional)"
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
              {...register('icdCode')}
            />
            <input
              placeholder="Diagnosis description"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              {...register('description')}
            />
          </div>
          {formState.errors.description && (
            <p className="text-xs text-red-600">{formState.errors.description.message}</p>
          )}
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <Button type="submit" disabled={formState.isSubmitting} className="self-start">
            {formState.isSubmitting ? 'Adding…' : 'Add diagnosis'}
          </Button>
        </form>
      )}
    </Card>
  );
}
