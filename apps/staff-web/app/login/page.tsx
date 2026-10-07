'use client';

import { useState } from 'react';
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

/**
 * Same organizationId-as-plain-text-field shape as
 * patient-web/app/login/page.tsx — see that file's comment for why (a
 * real, unresolved product decision on how a login UI should resolve
 * the org, not a shortcut taken here).
 */
export default function StaffLoginPage() {
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

  const inputClass =
    'h-10 w-full rounded-control border border-control bg-surface px-3 text-base text-fg placeholder:text-fg-subtle';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-panel border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold text-fg">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-fg-muted">Use your clinic staff account.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="organizationId" className="mb-1.5 block text-sm font-medium text-fg">
                Clinic ID
              </label>
              <input
                id="organizationId"
                type="text"
                autoComplete="off"
                className={inputClass}
                {...register('organizationId')}
              />
              {errors.organizationId && (
                <p className="mt-1.5 text-[13px] text-danger-fg">{errors.organizationId.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-fg">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
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
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className={inputClass}
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1.5 text-[13px] text-danger-fg">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p
                role="alert"
                className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              >
                {serverError}
              </p>
            )}

            <Button type="submit" loading={isSubmitting} className="mt-1 h-10 w-full">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
