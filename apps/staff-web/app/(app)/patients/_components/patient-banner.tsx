import { Avatar } from '../../../../components/ui/avatar';
import { Badge } from '../../../../components/ui/badge';
import { formatDate, fullName, humanize } from '../../../../lib/format';
import { ageLabel, type PatientSummary } from './patient-shared';

export interface HistoryEntry {
  id: string;
  category: string;
  description: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | null;
  status: 'ACTIVE' | 'RESOLVED' | 'ENTERED_IN_ERROR';
  createdAt: string;
}

/**
 * Design system section 8: the patient is always identifiable. Name, age,
 * date of birth, phone and ID, with the allergy strip beneath when the
 * role may read clinical data (`allergies` is undefined otherwise).
 */
export function PatientBanner({
  patient,
  patientId,
  allergies,
}: {
  patient: PatientSummary;
  patientId: string;
  allergies?: HistoryEntry[];
}) {
  const name = fullName(patient);

  return (
    <section aria-label="Patient" className="border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5">
        <Avatar name={name} size={48} />
        <div className="min-w-0 flex-1">
          {/* The record's one serif title (design system 3). */}
          <h1 className="truncate font-serif text-[2rem] font-medium leading-10 tracking-tight text-fg">
            {name}
          </h1>
          <p className="tabular font-mono mt-0.5 text-sm text-fg-muted">
            {ageLabel(patient.dateOfBirth)} · Born {formatDate(patient.dateOfBirth)}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-fg-subtle">Phone</dt>
            <dd className="tabular font-mono font-medium text-fg">{patient.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Patient ID</dt>
            <dd className="tabular font-mono text-[13px] font-medium text-fg">{patientId}</dd>
          </div>
        </dl>
      </div>
      {allergies && <AllergyStrip entries={allergies} />}
    </section>
  );
}

function AllergyStrip({ entries }: { entries: HistoryEntry[] }) {
  const active = entries.filter((e) => e.category === 'ALLERGY' && e.status === 'ACTIVE');
  const serious = active.filter((e) => e.severity === 'SEVERE' || e.severity === 'MODERATE');
  const mild = active.filter((e) => !(e.severity === 'SEVERE' || e.severity === 'MODERATE'));

  return (
    <div
      className={`mx-6 flex flex-wrap items-center gap-2 py-3 ${
        active.length > 0 ? 'border-t-2 border-danger-fg' : 'border-t border-line'
      }`}
    >
      <span
        className={`mr-2 text-sm font-medium ${active.length > 0 ? 'text-danger-fg' : 'text-fg-muted'}`}
      >
        Allergies
      </span>
      {active.length === 0 && <Badge tone="neutral">No known allergies</Badge>}
      {serious.map((e) => (
        <Badge key={e.id} tone="danger">
          {e.description}
          {e.severity ? ` · ${humanize(e.severity)}` : ''}
        </Badge>
      ))}
      {mild.map((e) => (
        <Badge key={e.id} tone="neutral">
          {e.description}
          {e.severity ? ` · ${humanize(e.severity)}` : ''}
        </Badge>
      ))}
    </div>
  );
}
