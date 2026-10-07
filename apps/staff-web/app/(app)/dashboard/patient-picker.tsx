'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { Field, Input } from '../../../components/ui/fields';

export interface PatientSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Server-side search typeahead. The API does the filtering and caps
 * results at 20 (see PatientsService.listForOrganization), so this
 * component never holds more than the current search's result page.
 * Debounced 300ms.
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

  // setSearching/setResults happen inside the setTimeout callback, not
  // as the effect's own first statement: react-hooks/set-state-in-effect
  // flags a synchronous setState in an effect body, and a deferred
  // callback is exempt.
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
        <span className="mb-1.5 block text-sm font-medium text-fg">Patient</span>
        <div className="flex h-10 items-center gap-2 rounded-control border border-control bg-surface-muted px-3 text-base text-fg">
          <span className="flex-1 truncate">
            {value.firstName} {value.lastName} ({value.phone})
          </span>
          <button
            type="button"
            className="cursor-pointer text-[13px] font-medium text-primary hover:text-primary-hover"
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
      <Field
        label="Patient *"
        htmlFor="patient-search"
        helper="Search by name or phone."
        error={error}
      >
        <Input
          id="patient-search"
          type="text"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => {
            // Delayed close: a result's onMouseDown (below) must fire and
            // clear this timeout first, or the list would unmount before
            // the click registers.
            blurTimeout.current = setTimeout(() => setShowResults(false), 150);
          }}
        />
      </Field>
      {showResults && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto border border-control bg-surface">
          {searching ? (
            <li className="px-3 py-2 text-[13px] text-fg-subtle">Searching</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-fg-subtle">
              {query.trim() ? 'No patients found.' : 'Start typing to search.'}
            </li>
          ) : (
            results.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  className="w-full cursor-pointer px-3 py-2 text-left text-sm text-fg hover:bg-surface-muted"
                  onMouseDown={(event) => {
                    // onMouseDown, not onClick: fires before the input's
                    // onBlur, so the selection wins the race.
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
