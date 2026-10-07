'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, IconContext } from '@phosphor-icons/react';
import { getPatientToken, PATIENT_TOKEN_KEY } from '../lib/auth';
import type { PatientNotification } from '../lib/types';
import { useApi } from '../lib/use-api';
import { Logo } from './logo';

interface Tab {
  label: string;
  href: string;
}

/**
 * The five tabs (design system 18.4), text only: appointments (with
 * video), records and reports, messages, and the patient's own space
 * (payments, feedback).
 */
const TABS: Tab[] = [
  { label: 'Home', href: '/home' },
  { label: 'Visits', href: '/appointments' },
  { label: 'Records', href: '/records' },
  { label: 'Messages', href: '/messages' },
  { label: 'Me', href: '/me' },
];

/** Pages reached from a hub highlight the tab they belong to. */
const PARENT: Record<string, string> = {
  '/visits': '/appointments',
  '/medicines': '/records',
  '/results': '/records',
  '/care': '/records',
  '/bills': '/me',
  '/feedback': '/me',
  '/notifications': '/me',
};

function activeTab(pathname: string): string | undefined {
  const parent = Object.keys(PARENT).find((p) => pathname.startsWith(p));
  if (parent) return PARENT[parent];
  return TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href;
}

const subscribe = (onChange: () => void) => {
  const handler = (event: StorageEvent) => {
    if (event.key === PATIENT_TOKEN_KEY) onChange();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};

/**
 * Signed-in frame: a slim top bar (wordmark and the bell; from `lg` also
 * the tabs, the active one underlined in cobalt), a white page on the
 * canvas, and on phones a bottom tab bar with text labels whose active
 * tab carries a 2px cobalt bar along its top edge. Without a session it
 * sends the patient to sign in; the API re-checks every request regardless.
 */
export function PatientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // null on the server render, the stored token (or null) in the browser.
  const token = useSyncExternalStore(subscribe, getPatientToken, () => undefined);
  const current = activeTab(pathname);

  useEffect(() => {
    if (token === null) router.replace('/login');
  }, [token, router]);

  if (!token) return null;

  return (
    <IconContext.Provider value={{ weight: 'light' }}>
      <div className="flex min-h-dvh flex-col bg-surface lg:bg-bg">
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-surface px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-6 px-5 sm:px-6 lg:h-16">
            <Link href="/home" className="flex min-h-12 items-center" aria-label="SereneMed home">
              <Logo />
            </Link>

            <nav aria-label="Main" className="hidden h-full lg:block">
              <ul className="flex h-full items-stretch gap-1">
                {TABS.map((tab) => {
                  const active = current === tab.href;
                  return (
                    <li key={tab.href} className="relative flex">
                      <Link
                        href={tab.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center px-4 transition-colors ${
                          active
                            ? 'font-semibold text-fg'
                            : 'font-medium text-fg-muted hover:text-fg'
                        }`}
                      >
                        {tab.label}
                      </Link>
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-3 bottom-0 h-0.5 bg-primary"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>

            <NotificationBell />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="pb-tabbar mx-auto w-full max-w-2xl flex-1 bg-surface px-5 pt-6 outline-none sm:px-6 lg:my-8 lg:flex-none lg:px-10 lg:pb-14 lg:pt-10"
        >
          {children}
        </main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <ul className="mx-auto grid h-16 max-w-2xl grid-cols-5">
            {TABS.map((tab) => {
              const active = current === tab.href;
              return (
                <li key={tab.href} className="relative">
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 top-0 h-0.5 bg-primary"
                    />
                  )}
                  <Link
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-full items-center justify-center text-[0.88rem] transition-colors ${
                      active ? 'font-semibold text-fg' : 'font-medium text-fg-muted hover:text-fg'
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </IconContext.Provider>
  );
}

/** Unread in-app alerts (new results, replies). Polls every minute. */
function NotificationBell() {
  const { data } = useApi<PatientNotification[]>('/patients/me/notifications', 60_000);
  const unread = data?.filter((n) => !n.readAt).length ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
      className="relative -mr-2 flex size-12 items-center justify-center rounded-control text-fg hover:bg-surface-muted lg:ml-2"
    >
      <Bell size={24} aria-hidden="true" />
      {unread > 0 && (
        <span className="tabular absolute right-1 top-1.5 flex min-w-5 items-center justify-center bg-danger-fg px-1 font-mono text-sm font-medium leading-5 text-on-primary">
          {unread}
        </span>
      )}
    </Link>
  );
}
