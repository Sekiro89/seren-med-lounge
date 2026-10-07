'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  CalendarBlank,
  ChatCircleText,
  FolderOpen,
  House,
  UserCircle,
  type Icon,
} from '@phosphor-icons/react';
import { getPatientToken, PATIENT_TOKEN_KEY } from '../lib/auth';
import type { PatientNotification } from '../lib/types';
import { useApi } from '../lib/use-api';

interface Tab {
  label: string;
  /** Shorter label for the phone tab bar, where five tabs share 360px. */
  short?: string;
  href: string;
  icon: Icon;
}

/**
 * The five tabs (design system 18.4), following the Patient Interface of
 * the SereneMed architecture: appointments (with video), records and
 * reports, messages, and the patient's own space (payments, feedback).
 */
const TABS: Tab[] = [
  { label: 'Home', href: '/home', icon: House },
  { label: 'Appointments', short: 'Visits', href: '/appointments', icon: CalendarBlank },
  { label: 'Records', href: '/records', icon: FolderOpen },
  { label: 'Messages', href: '/messages', icon: ChatCircleText },
  { label: 'Me', href: '/me', icon: UserCircle },
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
 * Signed-in frame: a top bar (brand, and the tabs from `lg` up) and a
 * bottom tab bar on phones. Without a session it sends the patient to
 * sign in; the API re-checks every request regardless.
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
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-surface px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-6 px-5 sm:px-6">
          <Link href="/home" className="flex items-center gap-2.5" aria-label="SereneMed home">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-bold text-on-primary">
              S
            </span>
            <span className="text-lg font-bold tracking-tight text-fg">SereneMed</span>
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {TABS.map((tab) => {
                const active = current === tab.href;
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-2 rounded-xl px-4 font-semibold transition-colors ${
                        active
                          ? 'bg-primary-subtle text-primary-subtle-fg'
                          : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                      }`}
                    >
                      <tab.icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                      {tab.label}
                    </Link>
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
        className="pb-tabbar mx-auto w-full max-w-2xl flex-1 px-5 pt-8 outline-none sm:px-6 lg:pb-16 lg:pt-12"
      >
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid h-16 max-w-2xl grid-cols-5">
          {TABS.map((tab) => {
            const active = current === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 text-[0.83rem] font-semibold transition-colors ${
                    active ? 'text-primary' : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  <tab.icon size={24} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  {tab.short ?? tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
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
      className="relative -mr-2 flex size-12 items-center justify-center rounded-full text-fg-muted hover:bg-surface-muted hover:text-fg lg:ml-2"
    >
      <Bell size={24} aria-hidden="true" />
      {unread > 0 && (
        <span className="tabular absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-danger-fg px-1 text-[0.8rem] font-bold leading-5 text-white">
          {unread}
        </span>
      )}
    </Link>
  );
}
