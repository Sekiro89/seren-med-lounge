'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';

/**
 * Find a patient from anywhere. Enter opens the Patients desk filtered
 * to the search; Cmd/Ctrl+K focuses the field. Only shown to roles that
 * may read patients.
 */
const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function TopbarSearch() {
  const router = useRouter();
  const mac = useSyncExternalStore(noop, isMac, () => false);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const q = query.trim();
        router.push(q ? `/patients?q=${encodeURIComponent(q)}` : '/patients');
        input.current?.blur();
      }}
      className="relative hidden w-52 md:block lg:w-44 xl:w-60 2xl:w-[280px]"
    >
      <MagnifyingGlass
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
      />
      <input
        ref={input}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        type="search"
        maxLength={100}
        aria-label="Search patients"
        placeholder="Search patients"
        className="h-9 w-full rounded-control border border-control bg-surface pl-9 pr-12 text-sm text-fg placeholder:text-fg-subtle"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-control border border-line px-1 font-mono text-[11px] text-fg-muted"
      >
        {mac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </form>
  );
}
