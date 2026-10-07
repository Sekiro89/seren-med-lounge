'use client';

import type { ReactNode } from 'react';
import { IconContext } from '@phosphor-icons/react';
import { Logo } from './logo';

/**
 * Signed-out pages (sign in, create account, activate), as the staff
 * sign-in (design system 14a): a white page with the wordmark, the title,
 * and the form under a 1px ink rule. No brand panel.
 */
export function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <IconContext.Provider value={{ weight: 'light' }}>
      <div className="flex min-h-dvh flex-col bg-surface">
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 w-full max-w-md items-center px-5 sm:px-6 lg:h-16">
            <Logo />
          </div>
        </header>

        <main className="flex flex-1 justify-center px-5 pb-12 pt-10 sm:px-6 lg:pt-16">
          <div className="w-full max-w-md">
            <p className="text-sm text-fg-muted">Your care, in one calm place</p>
            <h1 className="mt-1 text-[1.65rem] font-semibold leading-tight tracking-[-0.01em] text-fg">
              {title}
            </h1>
            <p className="mt-1.5 text-fg-muted">{description}</p>
            <div className="mt-6 border-t border-fg pt-6">{children}</div>
            {footer && (
              <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 text-fg-muted">
                {footer}
              </div>
            )}
            <p className="mt-10 text-sm text-fg-subtle">
              For an emergency, call <span className="font-mono">108</span>. This app is not
              monitored around the clock.
            </p>
          </div>
        </main>
      </div>
    </IconContext.Provider>
  );
}
