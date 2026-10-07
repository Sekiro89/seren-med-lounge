'use client';

import { useEffect, useState } from 'react';
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
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-5 lg:px-10">
          <Logo />
          <ClinicClock />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1440px] flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex justify-center px-5 py-16 lg:py-24">
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
        <HowAVisitMoves />
      </div>
    </main>
  );
}

/** Clinic time in the header, filled in after mount so server and client markup agree. */
function ClinicClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return null;
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return (
    <p className="ml-auto hidden items-center gap-3 text-[13px] text-fg-muted sm:flex">
      <span>{day}</span>
      <span aria-hidden="true" className="h-3.5 w-px bg-line" />
      <span className="tabular font-mono text-fg">{time} IST</span>
    </p>
  );
}

const STAGES: Array<{ label: string; desk: string; time?: string; now?: boolean }> = [
  { label: 'Check-in', desk: 'Reception', time: '18:44' },
  { label: 'Vitals', desk: 'Nurse', time: '18:52' },
  { label: 'Doctor', desk: 'Consultation', now: true },
  { label: 'Lab', desk: 'Samples' },
  { label: 'Billing', desk: 'Payment' },
  { label: 'Pharmacy', desk: 'Medicines' },
];

const PRINCIPLES: Array<[string, string]> = [
  ['Every desk works its own queue', 'A token moves from desk to desk, and each move is recorded.'],
  [
    'Nothing leaves draft without a doctor',
    'Notes and diagnoses stay drafts until a senior doctor signs them.',
  ],
  ['Patients follow along', 'The patient app shows the same token and the same stages, live.'],
];

/**
 * The right half of the sign-in page on wide screens: the product's own
 * visual language (the token ruler, ruled numbered sections) explaining
 * how a visit moves. Illustrative only; no patient data before sign-in.
 */
function HowAVisitMoves() {
  return (
    <aside
      aria-label="How a visit moves through the clinic"
      className="hidden border-l border-line bg-bg px-10 py-24 lg:block xl:px-16"
    >
      <div className="max-w-[34rem]">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-fg-subtle">
          One visit, every desk
        </p>
        <h2 className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.01em] text-fg">
          A token, a ruler and a record that a doctor signs.
        </h2>

        <figure className="mt-10 border border-line bg-surface px-6 pb-6 pt-5">
          <figcaption className="flex items-baseline justify-between text-[12px] text-fg-muted">
            <span>Token</span>
            <span>Example visit</span>
          </figcaption>
          <p className="tabular mt-1 font-mono text-[56px] font-medium leading-none text-fg">012</p>
          <ol className="mt-6 grid grid-cols-6 border-t border-control">
            {STAGES.map((s) => (
              <li key={s.label} className="relative pt-4">
                <span
                  aria-hidden="true"
                  className={`absolute -top-[6px] left-0 size-[11px] border ${
                    s.now
                      ? 'border-primary bg-primary'
                      : s.time
                        ? 'border-fg bg-fg'
                        : 'border-control bg-surface'
                  }`}
                />
                <p
                  className={`text-[13px] ${s.now ? 'font-semibold text-primary' : s.time ? 'text-fg' : 'text-fg-muted'}`}
                >
                  {s.label}
                </p>
                <p className="tabular font-mono text-[11px] text-fg-subtle">
                  {s.time ?? (s.now ? 'now' : '')}
                </p>
                <span className="sr-only">
                  {s.now ? 'current stage' : s.time ? 'done' : 'not yet'}
                </span>
              </li>
            ))}
          </ol>
        </figure>

        <ol className="mt-10 border-t border-fg">
          {PRINCIPLES.map(([title, text], i) => (
            <li
              key={title}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 border-b border-line py-4"
            >
              <span className="tabular font-mono text-[13px] text-fg-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="text-[15px] font-semibold text-fg">{title}</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
