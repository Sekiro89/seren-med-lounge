'use client';

import type { ReactNode } from 'react';
import { IconContext } from '@phosphor-icons/react';
import { Logo } from './logo';

/** What the app is for, as a short ruled list (no marketing, just the jobs). */
const JOBS: Array<[string, string]> = [
  ['Follow your visit', 'Your token and where you are, live, while you wait.'],
  ['Book a visit', 'At the clinic or by video, at a time that suits you.'],
  ['See your results', 'Each value against its normal range, in plain words.'],
  ['Message the clinic', 'Ask a question and get a reply in opening hours.'],
];

/**
 * Signed-out pages (sign in, create account, activate) in Clinical Ink:
 * a calm editorial page. On a phone the form comes first (title, 1px ink
 * rule, fields), then a ruled "what you can do here" list. Nothing on
 * these pages looks like a patient's own data. From `lg` the two sit side by side: the
 * editorial column at the left, the form at the right, a hairline
 * between. No brand panel, no illustration, no shadows.
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
          <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-4 px-5 sm:px-6 lg:h-16 lg:max-w-6xl lg:px-10">
            <Logo />
            <p className="font-mono text-sm text-fg-subtle">Patient app</p>
          </div>
        </header>

        <main className="mx-auto grid w-full max-w-md flex-1 grid-cols-1 px-5 pb-12 pt-8 sm:px-6 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-0 lg:px-10 lg:pb-16 lg:pt-16">
          {/* The form: first on a phone, at the right from lg. */}
          <div className="lg:order-2 lg:border-l lg:border-line lg:pl-14">
            <p className="text-sm text-fg-muted lg:hidden">Your care, in one calm place</p>
            <h1 className="mt-1 text-[1.6rem] font-semibold leading-tight tracking-[-0.01em] text-fg lg:mt-0 lg:text-[1.9rem]">
              {title}
            </h1>
            <p className="mt-1.5 text-fg-muted">{description}</p>
            <div className="mt-6 border-t border-fg pt-6">{children}</div>
            {footer && (
              <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 text-fg-muted">
                {footer}
              </div>
            )}
          </div>

          {/* The editorial column: below the form on a phone, at the left from lg. */}
          <aside aria-label="About the SereneMed app" className="mt-12 lg:order-1 lg:mt-0 lg:pr-14">
            <p className="hidden font-mono text-sm text-fg-subtle lg:block">
              SereneMed Lounge · for patients
            </p>
            <p className="hidden text-[3.2rem] font-semibold leading-[1.05] tracking-[-0.025em] text-fg lg:mt-4 lg:block">
              Your care,
              <br />
              in one calm place.
            </p>

            <h2 className="border-t border-fg pt-3 font-semibold lg:mt-12">What you can do here</h2>
            <ol className="mt-1 border-b border-line">
              {JOBS.map(([job, text], i) => (
                <li
                  key={job}
                  className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-t border-line py-3 first:border-t-0"
                >
                  <span className="tabular pt-0.5 font-mono text-sm text-fg-subtle">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="block font-medium text-fg">{job}</span>
                    <span className="block text-sm text-fg-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-8 text-sm text-fg-muted">
              For an emergency, call <span className="font-mono font-semibold text-fg">108</span>.
              This app is not monitored around the clock.
            </p>
          </aside>
        </main>
      </div>
    </IconContext.Provider>
  );
}
