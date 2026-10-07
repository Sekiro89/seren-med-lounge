'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { patientSignupSchema, type PatientSignupInput } from '@serenemed/validation';
import { ApiError } from '@serenemed/api-client';
import { CheckCircle } from '@phosphor-icons/react';
import { AuthFrame } from '../../components/auth-frame';
import { Field, FormError, TextInput, apiMessage } from '../../components/form';
import { Button, ButtonLink } from '../../components/ui';
import { apiClient } from '../../lib/api-client';
import { savePatientToken } from '../../lib/auth';

/**
 * Self sign-up (POST /auth/patient/signup). If the details match a record
 * the clinic already has but not confidently enough to link on its own,
 * the server answers `pending_verification` and the front desk confirms it
 * (patient claim rules). No Clinic ID field, as on the sign-in page.
 */
type SignupResponse =
  { status: 'active'; accessToken: string } | { status: 'pending_verification' };

const today = () => new Date().toISOString().slice(0, 10);

// The shared schema plus plain-language messages and the checks a person
// filling this in on a phone needs.
const formSchema = patientSignupSchema.extend({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(100),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(100),
  dateOfBirth: z
    .string()
    .date('Enter your date of birth.')
    .refine((d) => d >= '1900-01-01' && d <= today(), 'Enter a real date of birth.'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,20}$/, 'Enter a phone number, digits only.'),
  email: z.string().trim().email('Enter an email address, like name@example.com.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});

export default function PatientSignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientSignupInput>({ resolver: zodResolver(formSchema) });

  const onSubmit = async (data: PatientSignupInput) => {
    setServerError(null);
    try {
      const result = await apiClient.post<SignupResponse>('/auth/patient/signup', data);
      if (result.status === 'pending_verification') {
        setPending(true);
        return;
      }
      savePatientToken(result.accessToken);
      router.push('/home');
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.status === 409
            ? 'An account with this email already exists. Try signing in.'
            : apiMessage(error.body, 'We could not create your account.')
          : 'We could not reach SereneMed. Check your connection and try again.',
      );
    }
  };

  if (pending) {
    return (
      <AuthFrame
        title="Almost there"
        description="We need to check a few details before your account is ready."
      >
        <div className="flex flex-col items-start gap-4">
          <CheckCircle size={40} className="text-success-fg" aria-hidden="true" />
          <p className="text-fg-muted">
            It looks like the clinic may already have a record for you. Our front desk will match it
            to your new account so your history stays in one place. Try signing in again later, or
            ask at the desk on your next visit.
          </p>
          <ButtonLink href="/login" variant="secondary" full>
            Back to sign in
          </ButtonLink>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Create your account"
      description="It takes a minute. Use the details the clinic has for you."
      footer={
        <p>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={errors.firstName?.message} required>
            <TextInput
              id="firstName"
              autoComplete="given-name"
              aria-required="true"
              invalid={!!errors.firstName}
              {...register('firstName')}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message} required>
            <TextInput
              id="lastName"
              autoComplete="family-name"
              aria-required="true"
              invalid={!!errors.lastName}
              {...register('lastName')}
            />
          </Field>
        </div>
        <Field
          label="Date of birth"
          htmlFor="dateOfBirth"
          error={errors.dateOfBirth?.message}
          required
        >
          <TextInput
            id="dateOfBirth"
            type="date"
            autoComplete="bday"
            max={today()}
            aria-required="true"
            invalid={!!errors.dateOfBirth}
            {...register('dateOfBirth')}
          />
        </Field>
        <Field
          label="Mobile number"
          htmlFor="phone"
          hint="The number you gave the clinic."
          error={errors.phone?.message}
          required
        >
          <TextInput
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-required="true"
            invalid={!!errors.phone}
            {...register('phone')}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <TextInput
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-required="true"
            invalid={!!errors.email}
            {...register('email')}
          />
        </Field>
        <Field
          label="Password"
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
          {isSubmitting ? 'Creating your account' : 'Create account'}
        </Button>
      </form>
    </AuthFrame>
  );
}
