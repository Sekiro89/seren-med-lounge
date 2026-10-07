'use client';

import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { SearchBox } from '../../../../components/ui/search-box';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { fullName } from '../../../../lib/format';

export interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/** Type a name or phone, pick one patient. Debounced so each keystroke is not a request. */
export function PatientPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: PatientOption | undefined;
  onChange: (patient: PatientOption | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      apiClient
        .get<PatientOption[]>(`/patients?q=${encodeURIComponent(q)}`)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows.slice(0, 6));
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-control border border-control bg-surface px-3 text-base">
        <span className="truncate text-fg">
          {fullName(value)} <span className="text-fg-subtle">{value.phone}</span>
        </span>
        <button
          type="button"
          aria-label="Choose a different patient"
          onClick={() => onChange(undefined)}
          className="flex size-6 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <SearchBox
        id={id}
        aria-label="Search patients by name or phone"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <div aria-live="polite" className="mt-2">
        {searching && <Skeleton className="h-9 w-full" />}
        {!searching && failed && (
          <p className="text-[13px] text-danger-fg">Search failed. Please try again.</p>
        )}
        {!searching && !failed && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-[13px] text-fg-subtle">No patient matches that search.</p>
        )}
        {!searching && query.trim().length >= 2 && results.length > 0 && (
          <ul className="overflow-hidden rounded-control border border-line">
            {results.map((p) => (
              <li key={p.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => onChange(p)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  <span className="font-medium text-fg">{fullName(p)}</span>
                  <span className="tabular font-mono text-fg-subtle">{p.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
