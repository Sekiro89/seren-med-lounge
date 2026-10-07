'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';

/**
 * Find a patient from anywhere. Enter opens the Patients desk filtered
 * to the search; Cmd/Ctrl+K focuses the field. Only shown to roles that
 * may read patients.
 */
export function TopbarSearch() {
  const router = useRouter();
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
      className="relative hidden w-full max-w-sm md:block"
    >
      <MagnifyingGlass
        size={18}
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
        placeholder="Search patients by name or phone"
        className="h-9 w-full rounded-control border border-line bg-surface-muted pl-10 pr-14 text-sm text-fg placeholder:text-fg-subtle focus:border-control focus:bg-surface"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 font-mono text-[11px] text-fg-subtle"
      >
        Ctrl K
      </kbd>
    </form>
  );
}
