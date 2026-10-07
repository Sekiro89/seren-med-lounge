'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretDown } from '@phosphor-icons/react';
import type { StaffRole } from '@serenemed/types';
import { isActive, moreNavFor, primaryTabsFor, type NavGroup } from '../../lib/nav';
import { useApi } from '../../lib/use-api';

/** A tab-shaped link with the 2px cobalt bar under the active label. */
const TAB =
  'relative inline-flex h-16 shrink-0 cursor-pointer items-center gap-1.5 px-3 text-sm transition-colors xl:px-3.5';

function ActiveBar() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-3 bottom-0 h-0.5 bg-primary xl:inset-x-3.5"
    />
  );
}

/** Tokens waiting across the queue the role can see (polled like the queue page). */
function useQueueWaiting(enabled: boolean): number | undefined {
  const { data } = useApi<Array<{ status: string }>>(enabled ? '/queue' : null, 30_000);
  return data?.filter((row) => row.status === 'WAITING').length;
}

/**
 * The role's primary tabs and the More menu (design system 6.1, 6.3).
 * Shown from 1024px; below that the NavSheet takes over.
 */
export function PrimaryNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const tabs = primaryTabsFor(role);
  const more = moreNavFor(role);
  const hasQueue = tabs.some((tab) => tab.href === '/queue');
  const waiting = useQueueWaiting(hasQueue);
  const moreActive = more.some((group) => group.items.some((item) => isActive(pathname, item)));

  return (
    <nav aria-label="Main" className="hidden items-center lg:flex">
      <ul className="flex items-center">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab);
          const count = tab.href === '/queue' && waiting ? waiting : undefined;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                aria-label={count ? `${tab.label}, ${count} waiting` : undefined}
                className={`${TAB} ${active ? 'font-semibold text-fg' : 'font-medium text-fg-muted hover:text-fg'}`}
              >
                {tab.label}
                {count !== undefined && (
                  <span className="font-mono text-xs font-normal text-fg-muted">{count}</span>
                )}
                {active && <ActiveBar />}
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li>
            <MoreMenu groups={more} active={moreActive} pathname={pathname} />
          </li>
        )}
      </ul>
    </nav>
  );
}

function MoreMenu({
  groups,
  active,
  pathname,
}: {
  groups: NavGroup[];
  active: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a')?.focus();
    const onClick = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  // The panel hangs under the top bar from the More button, nudged left
  // when it would run off the right edge of a narrow window.
  useLayoutEffect(() => {
    if (!open || !panel.current || !button.current) return;
    const anchor = button.current.getBoundingClientRect();
    const width = panel.current.offsetWidth;
    const left = Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16));
    panel.current.style.left = `${left}px`;
  }, [open]);

  const columns =
    groups.length >= 3
      ? 'grid-cols-[repeat(2,13rem)] xl:grid-cols-[repeat(3,13rem)]'
      : groups.length === 2
        ? 'grid-cols-[repeat(2,13rem)]'
        : 'grid-cols-[13rem]';

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="more-menu"
        className={`${TAB} ${active ? 'font-semibold text-fg' : 'font-medium text-fg-muted hover:text-fg'}`}
      >
        More
        <CaretDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
        {active && <ActiveBar />}
      </button>
      {open && (
        <div
          ref={panel}
          id="more-menu"
          className="fixed top-16 z-30 max-h-[calc(100dvh-5rem)] w-max overflow-y-auto border border-control bg-surface p-6"
        >
          <div className={`grid items-start gap-x-8 gap-y-6 ${columns}`}>
            {groups.map((group) => (
              <NavGroupList
                key={group.label ?? 'top'}
                group={group}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One area of the menu: a caption over a hairline, then its links. Shared with the sheet. */
export function NavGroupList({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div>
      {group.label && (
        <p className="border-b border-line pb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
          {group.label}
        </p>
      )}
      <ul className="mt-1">
        {group.items.map((item) => {
          const active = isActive(pathname, item);
          const IconComponent = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-control px-2 text-sm ${
                  active
                    ? 'bg-primary-subtle font-medium text-primary-subtle-fg'
                    : 'text-fg hover:bg-surface-muted'
                }`}
              >
                <IconComponent size={18} aria-hidden="true" className="shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
