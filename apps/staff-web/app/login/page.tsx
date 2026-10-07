'use client';

import { useState } from 'react';
import { Eye, EyeSlash, ListChecks, ShieldCheck, UsersThree } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@serenemed/validation';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { saveStaffSession, type StaffUser } from '../../lib/auth';
import { homeFor } from '../../lib/nav';
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
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const result = await apiClient.post<{ accessToken: string; user: StaffUser }>(
        '/auth/login',
        data,
      );
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
  const inputClass =
    'h-11 w-full rounded-control border border-control bg-surface px-3 text-base text-fg placeholder:text-fg-subtle';

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-deep p-12 text-brand-deep-fg lg:flex lg:flex-col lg:justify-between">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 size-[420px] rounded-full border border-brand-deep-fg/10"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 size-[480px] rounded-full border border-brand-deep-fg/10"
        />
        <Logo tone="light" />
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-on-primary">
            Every visit, in one calm workspace.
          </h2>
          <ul className="mt-10 flex flex-col gap-6">
            {[
              {
                icon: UsersThree,
                title: 'The right desk for every role',
                text: 'Reception, nurses, doctors, pharmacy and billing each see only what they need.',
              },
              {
                icon: ListChecks,
                title: 'One record per patient',
                text: 'Visits, prescriptions, labs and bills stay together from first call to follow-up.',
              },
              {
                icon: ShieldCheck,
                title: 'Every action on the record',
                text: 'Clinical notes are versioned and every change is audited.',
              },
            ].map(({ icon: IconComponent, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-deep-fg/10 text-on-primary">
                  <IconComponent size={22} aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-medium text-on-primary">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[13px]">SereneMed Lounge, Digital Clinic Operating System</p>
      </aside>

      <section className="flex items-center justify-center bg-bg px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Welcome back</h1>
          <p className="mb-8 mt-2 text-sm text-fg-muted">Sign in to your clinic workspace.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-fg">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                className={inputClass}
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1.5 text-[13px] text-danger-fg">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-fg">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`${inputClass} pr-11`}
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
              {errors.password && (
                <p className="mt-1.5 text-[13px] text-danger-fg">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p
                role="alert"
                className="rounded-control bg-danger-bg px-3 py-2.5 text-sm text-danger-fg"
              >
                {serverError}
              </p>
            )}

            <Button type="submit" loading={isSubmitting} className="h-11 w-full text-[15px]">
              Sign in
            </Button>
          </form>

          <p className="mt-8 text-center text-[13px] text-fg-subtle">
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
