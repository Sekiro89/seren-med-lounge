'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  activatePatientAccountSchema,
  type ActivatePatientAccountInput,
} from '@serenemed/validation';
import { Button } from '@serenemed/ui';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { savePatientToken } from '../../lib/auth';

/**
 * The patient's half of "Send Account Activation" — Reception issues a
 * code (POST /patients/:id/send-activation) and relays it in person;
 * this page is where the patient redeems it themselves and sets their
 * own password. Deliberately never something Reception fills in on the
 * patient's behalf — see PatientsService.createActivationCode's doc
 * comment on why there's no messaging integration behind this either.
 */
export default function PatientActivatePage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivatePatientAccountInput>({
    resolver: zodResolver(activatePatientAccountSchema),
  });

  const onSubmit = async (data: ActivatePatientAccountInput) => {
    setServerError(null);
    try {
      const result = await apiClient.post<{ accessToken: string }>('/auth/patient/activate', {
        ...data,
        code: data.code.trim().toUpperCase(),
      });
      savePatientToken(result.accessToken);
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        const message =
          typeof error.body === 'object' && error.body && 'message' in error.body
            ? String((error.body as { message: unknown }).message)
            : 'Could not activate your account.';
        setServerError(message);
      } else {
        setServerError('Could not reach the server. Please try again.');
      }
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Activate your account</h1>
        <p className="mb-6 text-sm text-slate-600">
          Enter the code given to you at the clinic and choose a password.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-700">
              Activation code
            </label>
            <input
              id="code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm uppercase tracking-widest focus:border-slate-500 focus:outline-none"
              {...register('code')}
            />
            {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Choose a password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-500 focus:outline-none"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full py-2.5">
            {isSubmitting ? 'Activating…' : 'Activate account'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already activated?{' '}
          <Link href="/login" className="font-medium text-slate-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
