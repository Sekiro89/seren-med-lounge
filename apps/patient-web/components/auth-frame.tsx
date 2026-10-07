'use client';

import type { ReactNode } from 'react';
import { CalendarCheck, Flask, Pill, type Icon } from '@phosphor-icons/react';

const PROMISES: Array<{ icon: Icon; text: string }> = [
  { icon: CalendarCheck, text: 'Your next visit, and your place in the queue on the day' },
  { icon: Pill, text: 'What to take, how much and for how long' },
  { icon: Flask, text: 'Your test results, next to the normal range' },
];

/**
 * Signed-out pages (sign in, create account, activate). On phones a deep
 * teal header sits above the form; from `lg` it becomes a side panel
 * that says what the app is for.
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
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      <aside className="bg-brand-deep px-6 pb-16 pt-10 text-brand-deep-fg sm:px-10 lg:flex lg:w-[44%] lg:flex-col lg:justify-between lg:p-14">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 lg:mx-0">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-deep-fg text-xl font-bold text-brand-deep">
            S
          </span>
          <span className="text-xl font-bold tracking-tight text-white">SereneMed Lounge</span>
        </div>

        <div className="mx-auto mt-8 w-full max-w-md lg:mx-0 lg:mt-0">
          <p className="text-2xl font-bold leading-snug text-white lg:text-[2rem]">
            Your care, in one calm place.
          </p>
          <ul className="mt-8 hidden flex-col gap-5 lg:flex">
            {PROMISES.map(({ icon: PromiseIcon, text }) => (
              <li key={text} className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <PromiseIcon size={22} aria-hidden="true" />
                </span>
                <span className="text-lg">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-sm text-brand-deep-fg/70 lg:block">
          For an emergency, call 108. This app is not monitored around the clock.
        </p>
      </aside>

      <main className="-mt-8 flex flex-1 justify-center px-5 pb-12 sm:px-6 lg:mt-0 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-fg">
              {title}
            </h1>
            <p className="mt-2 text-fg-muted">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
          {footer && (
            <div className="mt-6 flex flex-col gap-3 text-center text-fg-muted">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}
