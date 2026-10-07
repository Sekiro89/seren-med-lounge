'use client';

import { useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@serenemed/validation';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { saveStaffSession, type StaffUser } from '../../lib/auth';
import { homeFor } from '../../lib/nav';
import { Field, Input } from '../../components/ui/fields';
import { invalidProps, req, requiredProps, clearOnEditRhf } from '../../lib/forms';
import { Button } from '../../components/ui/button';
import { Logo } from '../../components/shell/logo';
import { DemoLogins } from './demo-logins';

/**
 * No Clinic ID field: like the patient login, the server resolves the
 * clinic itself (the deployment's default) when none is sent.
 */
export default function StaffLoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    reValidateMode: 'onSubmit',
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const result = await apiClient.post<{ accessToken: string; user: StaffUser }>('/auth/login', {
        ...data,
        email: data.email.trim(),
      });
      saveStaffSession(result.accessToken, result.user);
      router.replace(homeFor(result.user.role));
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

  const [showPassword, setShowPassword] = useState(false);
  const emailMessage = errors.email
    ? getValues('email')?.trim()
      ? 'Enter a valid email address, like name@clinic.com.'
      : 'Enter your email address.'
    : undefined;
  const passwordMessage = errors.password
    ? getValues('password')
      ? 'Passwords have at least 8 characters.'
      : 'Enter your password.'
    : undefined;

  return (
    <main className="flex min-h-dvh flex-col bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center px-5 lg:px-10">
          <Logo />
        </div>
      </header>

      <section className="flex flex-1 justify-center px-5 py-16 lg:py-24">
        <div className="w-full max-w-[26rem]">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-fg-subtle">
            SereneMed Lounge
          </p>
          {/* The one serif line on the page (design system 14a). */}
          <h1 className="mt-2 font-serif text-[2rem] font-medium leading-10 tracking-tight text-fg">
            Clinic staff sign in
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Use the email and password your clinic administrator gave you.
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            onChange={clearOnEditRhf(clearErrors, () => setServerError(null))}
            className="section-rule mt-8 flex flex-col gap-5 border-x border-b border-x-line border-b-line px-6 pb-7 pt-6"
            noValidate
          >
            <Field label={req('Email')} htmlFor="email" error={emailMessage}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                maxLength={254}
                {...requiredProps}
                {...invalidProps(emailMessage)}
                {...register('email')}
              />
            </Field>

            <Field label={req('Password')} htmlFor="password" error={passwordMessage}>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-11"
                  {...requiredProps}
                  {...invalidProps(passwordMessage)}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg"
                >
                  {showPassword ? (
                    <EyeSlash size={20} aria-hidden="true" />
                  ) : (
                    <Eye size={20} aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>

            {serverError && (
              <p
                role="alert"
                className="rounded-control border-l-2 border-danger-fg bg-danger-bg px-3 py-2.5 text-sm text-danger-fg"
              >
                {serverError}
              </p>
            )}

            <Button type="submit" loading={isSubmitting} className="mt-1 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-[13px] text-fg-muted">
            Trouble signing in? Ask your clinic administrator.
          </p>

          {process.env.NODE_ENV !== 'production' && (
            <DemoLogins
              disabled={isSubmitting}
              onPick={(email, password) => {
                setValue('email', email);
                setValue('password', password);
                void handleSubmit(onSubmit)();
              }}
            />
          )}
        </div>
      </section>
    </main>
  );
}
