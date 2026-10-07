'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../lib/api-client';

export interface PatientSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Server-side search typeahead — replaces a plain `<select>` that
 * loaded every patient in the org on every dashboard visit, which
 * doesn't scale (see PatientsService.listForOrganization's `q` param,
 * apps/api/src/patients/patients.service.ts, for the backend half).
 * Debounced 300ms; the API does the actual filtering and caps results
 * at 20, so this component never holds more than the current search's
 * result page in memory.
 */
export function PatientPicker({
  value,
  onChange,
  error,
}: {
  value: PatientSummary | null;
  onChange: (patient: PatientSummary | null) => void;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // setSearching/setResults both happen inside the setTimeout callback,
  // not as the effect's own first statement — react-hooks'
  // set-state-in-effect rule flags a direct/synchronous setState call
  // in an effect body (see dashboard/page.tsx's mount-effect comment for
  // the same issue elsewhere); a deferred callback like this one is
  // exempt, since it isn't part of the effect's synchronous execution.
  useEffect(() => {
    if (!showResults) return;
    const handle = setTimeout(() => {
      setSearching(true);
      apiClient
        .get<PatientSummary[]>(`/patients?q=${encodeURIComponent(query)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, showResults]);

  if (value) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Patient</label>
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
          <span className="flex-1">
            {value.firstName} {value.lastName} ({value.phone})
          </span>
          <button
            type="button"
            className="text-xs font-medium text-slate-500 underline"
            onClick={() => onChange(null)}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-700">Patient</label>
      <input
        type="text"
        placeholder="Search by name or phone…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
        onBlur={() => {
          // Delayed close, not immediate — a result's onMouseDown
          // (below) needs to fire and clear this timeout first, or the
          // list would unmount out from under the click before it
          // registers.
          blurTimeout.current = setTimeout(() => setShowResults(false), 150);
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {showResults && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
          {searching ? (
            <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-400">
              {query.trim() ? 'No patients found.' : 'Start typing to search.'}
            </li>
          ) : (
            results.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onMouseDown={(event) => {
                    // onMouseDown, not onClick — fires before the
                    // input's onBlur, so the selection wins the race
                    // instead of the blur handler hiding the list first.
                    event.preventDefault();
                    if (blurTimeout.current) clearTimeout(blurTimeout.current);
                    onChange(patient);
                    setQuery('');
                    setShowResults(false);
                  }}
                >
                  {patient.firstName} {patient.lastName} ({patient.phone})
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
