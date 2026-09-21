'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@serenemed/validation';
import { Button } from '@serenemed/ui';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { savePatientToken } from '../../lib/auth';

/**
 * organizationId is a plain text field, not a picker — this mirrors a
 * real, unresolved product decision, not a UI shortcut taken lightly.
 * Patient.email is unique per (organizationId, email), so a login
 * request has to say which organization before a lookup can happen, and
 * there's no decision yet on how a real UI resolves that (subdomain, an
 * org picker, email-domain lookup) — see
 * docs/architecture/open-questions.md#3 and loginSchema's own comment
 * in @serenemed/validation.
 */
export default function PatientLoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const result = await apiClient.post<{ accessToken: string }>('/auth/patient/login', data);
      savePatientToken(result.accessToken);
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        const message =
          typeof error.body === 'object' && error.body && 'message' in error.body
            ? String((error.body as { message: unknown }).message)
            : 'Login failed.';
        setServerError(message);
      } else {
        setServerError('Could not reach the server. Please try again.');
      }
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Patient sign in</h1>
        <p className="mb-6 text-sm text-slate-600">
          Sign in to view your appointments and records.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div>
            <label
              htmlFor="organizationId"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Clinic ID
            </label>
            <input
              id="organizationId"
              type="text"
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              {...register('organizationId')}
            />
            {errors.organizationId && (
              <p className="mt-1 text-xs text-red-600">{errors.organizationId.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
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

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
