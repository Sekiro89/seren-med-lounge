'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientLoginSchema, type PatientLoginInput } from '@serenemed/validation';
import { ApiError } from '@serenemed/api-client';
import { AuthFrame } from '../../components/auth-frame';
import { Field, FormError, TextInput, apiMessage } from '../../components/form';
import { Button } from '../../components/ui';
import { apiClient } from '../../lib/api-client';
import { savePatientToken } from '../../lib/auth';

/**
 * No Clinic ID field: a patient shouldn't need an internal organisation
 * id to sign in. The server resolves it (AuthController
 * .resolveOrganizationId, env.DEFAULT_ORGANIZATION_ID); see
 * patientLoginSchema in @serenemed/validation.
 */
export default function PatientLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const expired = useSearchParams().get('expired') === '1';
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PatientLoginInput>({ resolver: zodResolver(patientLoginSchema) });

  const onSubmit = async (data: PatientLoginInput) => {
    setServerError(null);
    try {
      const result = await apiClient.post<{ accessToken: string }>('/auth/patient/login', data);
      savePatientToken(result.accessToken);
      router.push('/home');
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.status === 429
            ? 'Too many attempts. Please wait a minute and try again.'
            : apiMessage(error.body, 'That email and password do not match.')
          : 'We could not reach SereneMed. Check your connection and try again.',
      );
    }
  };

  return (
    <AuthFrame
      title="Welcome back"
      description="Sign in to see your visits, medicines and results."
      footer={
        <>
          <p>
            New to SereneMed?{' '}
            <Link href="/signup" className="font-medium text-primary underline underline-offset-4">
              Create an account
            </Link>
          </p>
          <p>
            Got a code from the clinic?{' '}
            <Link
              href="/activate"
              className="font-medium text-primary underline underline-offset-4"
            >
              Activate your account
            </Link>
          </p>
        </>
      }
    >
      {expired && (
        <p className="mb-6 border-l-2 border-primary py-1 pl-4 font-medium text-fg">
          You were signed out to keep your records safe. Please sign in again.
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-required="true"
            invalid={!!errors.email}
            {...register('email')}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            aria-required="true"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <FormError message={serverError} />
        <Button type="submit" full loading={isSubmitting}>
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      {/* Local development only: the condition is false in production builds, so the
          demo account never ships. Same guard as staff-web's demo-logins.tsx. */}
      {process.env.NODE_ENV !== 'production' && (
        <button
          type="button"
          onClick={() => {
            setValue('email', 'patient@demo.local');
            setValue('password', 'dev-password-123');
          }}
          className="mt-6 min-h-12 w-full cursor-pointer rounded-control border border-dashed border-control px-4 text-fg-muted hover:bg-surface-muted"
        >
          Fill in the demo patient (development only)
        </button>
      )}
    </AuthFrame>
  );
}
