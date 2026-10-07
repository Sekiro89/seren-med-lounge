'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { List, X } from '@phosphor-icons/react';
import {
  clearStaffSession,
  getStoredUserSnapshot,
  subscribeToSession,
  type StaffUser,
} from '../../lib/auth';
import { StaffProvider } from '../../lib/staff-context';
import { Skeleton } from '../ui/skeleton';
import { Logo } from './logo';
import { NotificationBell } from './notification-bell';
import { TopbarSearch } from './topbar-search';
import { can } from '../../lib/permissions';
import { Sidebar } from './sidebar';
import { usePathname } from 'next/navigation';
import { findNavItem } from '../../lib/nav';
import { UserMenu } from './user-menu';

/**
 * Signed-in frame for every staff page: sidebar (a drawer under 1024px),
 * top bar, and the content area. If nobody is signed in it sends them to
 * /login. This is a UX redirect only; the API still rejects any request
 * without a valid token.
 */
/**
 * TODO(product): the clinic's display name should come from the signed-in
 * user's organization once the API returns it; until then a neutral label.
 */
const CLINIC_NAME = 'SereneMed Lounge';

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const signOut = () => {
    clearStaffSession();
    router.replace('/login');
  };

  if (!user) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-[248px] border-r border-line bg-sidebar lg:block" />
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <title>{pageLabel ? `${pageLabel} · SereneMed Lounge` : 'SereneMed Lounge'}</title>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus:shadow-popover"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh border-r border-line lg:block">
        <Sidebar role={user.role} clinicName={CLINIC_NAME} />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onKeyDown={(e) => e.key === 'Escape' && setDrawerOpen(false)}
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-pointer bg-fg/40"
          />
          <aside className="absolute inset-y-0 left-0 w-[248px] border-r border-line bg-sidebar shadow-popover">
            <Sidebar
              role={user.role}
              clinicName={CLINIC_NAME}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface px-5 lg:px-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
              className="flex size-9 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted lg:hidden"
            >
              {drawerOpen ? <X size={20} /> : <List size={20} />}
            </button>
            <div className="lg:hidden">
              <Logo />
            </div>
          </div>
          {can(user.role, 'patient:read') ? <TopbarSearch /> : <span />}
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserMenu user={user} onSignOut={signOut} />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="outline-none mx-auto w-full max-w-[1440px] flex-1 px-5 py-8 lg:px-10 lg:py-10"
        >
          <StaffProvider value={user}>{children}</StaffProvider>
        </main>
      </div>
    </div>
  );
}
