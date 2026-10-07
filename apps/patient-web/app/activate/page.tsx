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
import { ApiError } from '@serenemed/api-client';
import { AuthFrame } from '../../components/auth-frame';
import { Field, FormError, TextInput, apiMessage } from '../../components/form';
import { Button } from '../../components/ui';
import { apiClient } from '../../lib/api-client';
import { savePatientToken } from '../../lib/auth';

/**
 * The patient's half of "Send Account Activation": reception issues a
 * code (POST /patients/:id/send-activation) and gives it to the patient in
 * person; the patient redeems it here and sets their own password. See
 * PatientsService.createActivationCode for why no message carries it.
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
      router.push('/home');
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? apiMessage(error.body, 'That code did not work. Check it, or ask the front desk.')
          : 'We could not reach SereneMed. Check your connection and try again.',
      );
    }
  };

  return (
    <AuthFrame
      title="Activate your account"
      description="Enter the code the clinic gave you, then choose a password."
      footer={
        <p>
          Already activated?{' '}
          <Link href="/login" className="font-medium text-primary underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <Field
          label="Activation code"
          htmlFor="code"
          hint="It is on the slip from the front desk."
          error={errors.code?.message}
          required
        >
          <TextInput
            id="code"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            aria-required="true"
            invalid={!!errors.code}
            className="font-mono uppercase tracking-[0.3em]"
            {...register('code')}
          />
        </Field>
        <Field
          label="Choose a password"
          htmlFor="password"
          hint="At least 8 characters."
          error={errors.password?.message}
          required
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            aria-required="true"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <FormError message={serverError} />
        <Button type="submit" full loading={isSubmitting}>
          {isSubmitting ? 'Activating' : 'Activate account'}
        </Button>
      </form>
    </AuthFrame>
  );
}
