'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { List } from '@phosphor-icons/react';
import {
  clearStaffSession,
  getStoredUserSnapshot,
  subscribeToSession,
  type StaffUser,
} from '../../lib/auth';
import { StaffProvider } from '../../lib/staff-context';
import { can } from '../../lib/permissions';
import { findNavItem, homeFor } from '../../lib/nav';
import { Skeleton } from '../ui/skeleton';
import { BreadcrumbProvider } from './breadcrumb';
import { ContextRow } from './context-row';
import { Logo } from './logo';
import { NavSheet } from './nav-sheet';
import { NotificationBell } from './notification-bell';
import { PrimaryNav } from './primary-nav';
import { TopbarSearch } from './topbar-search';
import { UserMenu } from './user-menu';

/**
 * TODO(product): the clinic's display name should come from the signed-in
 * user's organization once the API returns it; until then a neutral label.
 */
const CLINIC_NAME = 'SereneMed Lounge';

/**
 * Signed-in frame for every staff page (design system 6.1): a 64px top
 * bar (wordmark, the role's primary tabs, More, search, bell, account)
 * over a 40px context row (clinic, date, clinic-time clock, breadcrumb,
 * open status). No sidebar; under 1024px the tabs collapse into a menu
 * sheet. If nobody is signed in it sends them to /login. This is a UX
 * redirect only; the API still rejects any request without a valid token.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pageLabel = findNavItem(pathname)?.label;
  // undefined while rendering on the server / hydrating, null when signed out.
  const stored = useSyncExternalStore(subscribeToSession, getStoredUserSnapshot, () => undefined);
  const user = useMemo<StaffUser | null | undefined>(() => {
    if (stored === undefined) return undefined;
    if (stored === null) return null;
    try {
      return JSON.parse(stored) as StaffUser;
    } catch {
      return null;
    }
  }, [stored]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const signOut = () => {
    clearStaffSession();
    router.replace('/login');
  };

  if (!user) {
    return (
      <div className="min-h-dvh">
        <div className="h-16 border-b border-line bg-surface" />
        <div className="h-10 border-b border-line bg-surface" />
        <div className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <title>{pageLabel ? `${pageLabel} · SereneMed Lounge` : 'SereneMed Lounge'}</title>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:border focus:border-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fg"
      >
        Skip to content
      </a>

      <BreadcrumbProvider>
        <header className="sticky top-0 z-20 bg-surface">
          <div className="border-b border-line">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-5 lg:px-10">
              <button
                ref={menuButton}
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label="Open menu"
                aria-expanded={sheetOpen}
                className="-ml-2 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg hover:bg-surface-muted lg:hidden"
              >
                <List size={22} aria-hidden="true" />
              </button>
              <Link
                href={homeFor(user.role)}
                aria-label="SereneMed staff, home"
                className="flex h-7 shrink-0 items-center lg:mr-2 lg:border-r lg:border-line lg:pr-6 xl:pr-8"
              >
                <Logo />
              </Link>
              <PrimaryNav role={user.role} />
              <div className="ml-auto flex items-center gap-2 xl:gap-3">
                {can(user.role, 'patient:read') && <TopbarSearch />}
                <NotificationBell />
                <span aria-hidden="true" className="hidden h-7 w-px bg-line md:block" />
                <UserMenu user={user} onSignOut={signOut} />
              </div>
            </div>
          </div>
          <ContextRow clinicName={CLINIC_NAME} />
        </header>

        <NavSheet
          role={user.role}
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false);
            menuButton.current?.focus();
          }}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-8 outline-none lg:px-10 lg:py-10"
        >
          <StaffProvider value={user}>{children}</StaffProvider>
        </main>
      </BreadcrumbProvider>
    </div>
  );
}
