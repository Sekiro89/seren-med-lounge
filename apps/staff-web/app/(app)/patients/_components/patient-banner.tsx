import { Warning } from '@phosphor-icons/react';
import { StatusWord } from '../../../../components/ui/ink';
import { Skeleton } from '../../../../components/ui/skeleton';
import { formatDate, fullName, humanize } from '../../../../lib/format';
import {
  ageLabel,
  formatPhone,
  sexLetter,
  type PatientDetail,
  type PatientSummary,
} from './patient-shared';

export interface HistoryEntry {
  id: string;
  category: string;
  description: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | null;
  status: 'ACTIVE' | 'RESOLVED' | 'ENTERED_IN_ERROR';
  createdAt: string;
}

const CLINIC_NAME = 'SereneMed Lounge';

/** `F · 34 yrs · born 21 Jul 1992 · +91 98901 23456`, the identity line under the name. */
export function identityLine(patient: PatientSummary): string {
  return [
    sexLetter(patient.sex),
    ageLabel(patient.dateOfBirth),
    `born ${formatDate(patient.dateOfBirth)}`,
    formatPhone(patient.phone),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The record's letterhead (design system 7 and 8): clinic and record type,
 * the patient name in Plex Serif (the page's one serif line), the two
 * identifiers, the patient number set large in Plex Mono, then the allergy
 * line under a 2px red rule when the role may read clinical data.
 */
export function PatientLetterhead({
  patient,
  history,
}: {
  patient: PatientDetail;
  /** Undefined for roles without clinical access: no allergy line at all. */
  history?: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
}) {
  return (
    <div className="pb-4 pt-7">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs text-fg-muted">{CLINIC_NAME} · Patient record</p>
          <h1 className="mt-1.5 font-serif text-[32px] font-medium leading-[1.1] tracking-[-0.01em] text-fg">
            {fullName(patient)}
          </h1>
          <p className="tabular mt-1.5 text-[13px] text-fg-muted">{identityLine(patient)}</p>
          {patient.email && <p className="mt-0.5 text-[13px] text-fg-muted">{patient.email}</p>}
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="text-[11px] text-fg-muted">Patient no.</p>
          <p className="tabular font-mono text-[26px] font-medium leading-none text-fg">
            {patient.mrn ?? <span className="text-[15px] text-fg-subtle">Not issued</span>}
          </p>
          <div className="mt-2">
            <StatusWord tone={patient.hasAccount ? 'success' : 'neutral'}>
              {patient.hasAccount ? 'Portal account active' : 'No portal account'}
            </StatusWord>
          </div>
        </div>
      </div>
      {history && (
        <div className="mt-4">
          <AllergyRule history={history} />
        </div>
      )}
    </div>
  );
}

/** Allergy line under the 2px red rule, conditions at the right (design system 8.1). */
export function AllergyRule({
  history,
}: {
  history: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
}) {
  const active = (history.entries ?? []).filter((e) => e.status === 'ACTIVE');
  const allergies = active.filter((e) => e.category === 'ALLERGY');
  const conditions = active.filter((e) => e.category === 'CONDITION');
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-t-2 border-b-line border-t-danger py-2 text-[13px]">
      {history.loading ? (
        <Skeleton className="h-4 w-48" />
      ) : history.failed ? (
        <span className="flex items-center gap-2 font-medium text-danger-fg">
          <Warning size={17} aria-hidden="true" />
          Allergies could not be loaded. Check again before prescribing.
        </span>
      ) : allergies.length > 0 ? (
        <>
          <Warning size={17} className="text-danger-fg" aria-hidden="true" />
          <span className="text-xs font-semibold text-danger-fg">
            {allergies.length === 1 ? 'Allergy' : 'Allergies'}
          </span>
          {allergies.map((a) => (
            <span key={a.id}>
              <span className="font-medium text-fg">{a.description}</span>
              {a.severity && (
                <span
                  className={`ml-1.5 ${a.severity === 'MILD' ? 'text-fg-muted' : 'font-medium text-danger-fg'}`}
                >
                  {humanize(a.severity).toLowerCase()}
                </span>
              )}
            </span>
          ))}
        </>
      ) : (
        <span className="text-neutral-fg">No known allergies</span>
      )}
      {!history.loading && !history.failed && conditions.length > 0 && (
        <span className="ml-auto flex flex-wrap gap-x-3">
          <span className="text-fg-muted">Conditions</span>
          <span className="text-fg">{conditions.map((c) => c.description).join(' · ')}</span>
        </span>
      )}
    </div>
  );
}
