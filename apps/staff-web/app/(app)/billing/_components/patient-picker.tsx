'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../../lib/api-client';
import { fullName } from '../../../../lib/format';
import { Avatar } from '../../../../components/ui/avatar';
import { Field } from '../../../../components/ui/fields';
import { SearchBox } from '../../../../components/ui/search-box';

export interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/** Debounced server-side patient search; the API returns at most 20. */
export function PatientPicker({
  value,
  onChange,
  error,
}: {
  value: PatientOption | null;
  onChange: (patient: PatientOption | null) => void;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      setSearching(true);
      apiClient
        .get<PatientOption[]>(`/patients?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  if (value) {
    return (
      <Field label="Patient" htmlFor="invoice-patient">
        <div
          id="invoice-patient"
          className="flex items-center gap-3 rounded-control border border-control bg-surface-muted px-3 py-2"
        >
          <Avatar name={fullName(value)} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{fullName(value)}</p>
            <p className="tabular text-[13px] text-fg-muted">{value.phone}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="cursor-pointer text-[13px] font-medium text-primary hover:text-primary-hover"
          >
            Change
          </button>
        </div>
      </Field>
    );
  }

  const term = query.trim();
  return (
    <Field
      label="Patient"
      htmlFor="invoice-patient-search"
      error={error}
      helper="Search by name or phone number."
    >
      <SearchBox
        id="invoice-patient-search"
        aria-label="Search patients"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {term.length >= 2 && (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-control border border-line">
          {searching ? (
            <li className="px-3 py-2 text-[13px] text-fg-muted">Searching...</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-fg-muted">No patients found.</li>
          ) : (
            results.map((p) => (
              <li key={p.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setQuery('');
                    setResults([]);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  <span className="font-medium">{fullName(p)}</span>
                  <span className="tabular text-[13px] text-fg-muted">{p.phone}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </Field>
  );
}
