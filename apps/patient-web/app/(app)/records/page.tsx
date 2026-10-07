'use client';

import {
  CalendarCheck,
  ClipboardText,
  ClockCounterClockwise,
  Flask,
  Folder,
  Heartbeat,
  Pill,
  Warning,
  type Icon,
} from '@phosphor-icons/react';
import {
  Chip,
  ErrorNote,
  IconBadge,
  LinkCard,
  PageTitle,
  Rows,
  SectionHeading,
  Skeleton,
} from '../../../components/ui';
import { formatDayNumber, formatMonthShort } from '../../../lib/format';
import type {
  Appointment,
  CarePlan,
  Diagnosis,
  HistoryEntry,
  LabOrder,
  PatientDocument,
  Prescription,
} from '../../../lib/types';
import { useApi, useNow, type ApiState } from '../../../lib/use-api';

const DAY_MS = 86_400_000;

/** `5 Sep` */
const shortDate = (iso: string) => `${formatDayNumber(iso)} ${formatMonthShort(iso)}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The patient's health record in one place: a hub to medicines, reports,
 * care plan and past visits, then a health summary (conditions and
 * allergies) a patient can show to another doctor.
 */
export default function RecordsPage() {
  const now = useNow();
  const prescriptions = useApi<Prescription[]>('/patients/me/prescriptions');
  const labs = useApi<LabOrder[]>('/patients/me/lab-orders');
  const plans = useApi<CarePlan[]>('/patients/me/care-plans');
  const appointments = useApi<Appointment[]>('/patients/me/appointments');
  const diagnoses = useApi<Diagnosis[]>('/patients/me/diagnoses');
  const history = useApi<HistoryEntry[]>('/patients/me/medical-history');
  const documents = useApi<PatientDocument[]>('/patients/me/documents');
  const documentCount = documents.data?.length ?? 0;

  // Same rule as the Medicines page: an active course that has not run out.
  const takingNow = (prescriptions.data ?? [])
    .filter((p) => p.status === 'ACTIVE')
    .flatMap((p) =>
      p.items.filter(
        (item) =>
          !item.durationDays || new Date(p.createdAt).getTime() + item.durationDays * DAY_MS > now,
      ),
    ).length;

  const results = (labs.data ?? [])
    .filter((o) => o.status !== 'CANCELLED')
    .flatMap((o) => o.items)
    .filter((item) => item.results.length > 0);
  const latestResult = results
    .flatMap((item) => item.results.map((r) => r.createdAt))
    .sort()
    .at(-1);

  const activePlan = (plans.data ?? [])
    .filter((p) => p.status === 'ACTIVE')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const pastVisits = (appointments.data ?? []).filter(
    (a) =>
      a.status !== 'CANCELLED' &&
      a.status !== 'NO_SHOW' &&
      new Date(a.scheduledAt).getTime() <= now,
  ).length;

  const hubs: Array<{
    href: string;
    icon: Icon;
    title: string;
    state: ApiState<unknown>;
    summary: string;
  }> = [
    {
      href: '/medicines',
      icon: Pill,
      title: 'Medicines',
      state: prescriptions,
      summary: takingNow > 0 ? `${takingNow} taking now` : 'Nothing to take right now',
    },
    {
      href: '/results',
      icon: Flask,
      title: 'Test results',
      state: labs,
      summary:
        results.length > 0
          ? `${plural(results.length, 'test result', 'test results')}${
              latestResult ? ` · latest ${shortDate(latestResult)}` : ''
            }`
          : 'No test results yet',
    },
    {
      href: '/care',
      icon: ClipboardText,
      title: 'Care plan',
      state: plans,
      summary: activePlan?.title ?? 'No care plan',
    },
    {
      href: '/appointments',
      icon: CalendarCheck,
      title: 'Past visits',
      state: appointments,
      summary: pastVisits > 0 ? plural(pastVisits, 'visit', 'visits') : 'No visits yet',
    },
  ];

  const rows: Array<{
    href: string;
    icon: Icon;
    title: string;
    /** The load behind the summary line; none for a plain link. */
    state?: ApiState<unknown>;
    summary: string;
  }> = [
    ...hubs,
    {
      href: '/records/timeline',
      icon: ClockCounterClockwise,
      title: 'Your timeline',
      summary: 'Everything in order, newest first',
    },
    {
      href: '/records/documents',
      icon: Folder,
      title: 'Documents',
      state: documents,
      summary:
        documentCount > 0
          ? plural(documentCount, 'document on file', 'documents on file')
          : 'No documents yet',
    },
  ];

  return (
    <div>
      <PageTitle title="Records" description="Your health record in one place." />

      <div className="flex flex-col gap-10">
        <nav aria-label="Your record" className="border-t border-fg">
          <Rows>
            {rows.map((row) => (
              <li key={row.href}>
                <LinkCard href={row.href}>
                  <div className="flex items-center gap-4">
                    <IconBadge icon={row.icon} />
                    <div className="min-w-0">
                      <p className="font-medium">{row.title}</p>
                      {row.state?.loading ? (
                        <Skeleton className="mt-1 h-4 w-32" />
                      ) : row.state?.error ? (
                        <p className="text-sm text-fg-muted">Tap to open</p>
                      ) : (
                        <p className="text-sm text-fg-muted">{row.summary}</p>
                      )}
                    </div>
                  </div>
                </LinkCard>
              </li>
            ))}
          </Rows>
        </nav>

        <section aria-labelledby="health-summary">
          <SectionHeading>
            <span id="health-summary">Health summary</span>
          </SectionHeading>
          {diagnoses.loading || history.loading ? (
            <Skeleton className="h-40" />
          ) : diagnoses.error || history.error ? (
            <ErrorNote
              message={diagnoses.error ?? history.error ?? ''}
              onRetry={() => {
                diagnoses.reload();
                history.reload();
              }}
            />
          ) : (
            <HealthSummary diagnoses={diagnoses.data ?? []} history={history.data ?? []} />
          )}
        </section>
      </div>
    </div>
  );
}

function HealthSummary({
  diagnoses,
  history,
}: {
  diagnoses: Diagnosis[];
  history: HistoryEntry[];
}) {
  const conditions = [...diagnoses]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => ({
      id: d.id,
      version: [...d.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    }))
    .filter((d) => d.version);
  const allergies = history.filter((h) => h.category === 'ALLERGY');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="flex items-center gap-2 pt-1 text-sm font-semibold text-fg-muted">
          <Heartbeat size={20} aria-hidden="true" />
          Conditions your doctor has noted
        </h3>
        {conditions.length === 0 ? (
          <p className="mt-2 text-fg-muted">None recorded.</p>
        ) : (
          <Rows className="mt-1">
            {conditions.map(({ id, version }) => (
              <li key={id} className="py-3">
                <p className="font-medium">{version.description}</p>
                {version.icdCode && (
                  <p className="text-sm text-fg-subtle">
                    Code <span className="font-mono">{version.icdCode}</span>
                  </p>
                )}
              </li>
            ))}
          </Rows>
        )}
      </div>

      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
          <Warning size={20} aria-hidden="true" />
          Allergies
        </h3>
        {allergies.length === 0 ? (
          <p className="mt-2 text-fg-muted">No allergies recorded.</p>
        ) : (
          <Rows className="mt-1">
            {allergies.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <Chip tone="danger">Allergy</Chip>
                <span className="font-medium">
                  {a.description}
                  {a.status === 'RESOLVED' && (
                    <span className="font-normal text-fg-muted"> · no longer a problem</span>
                  )}
                </span>
              </li>
            ))}
          </Rows>
        )}
      </div>

      <p className="text-fg-muted">Show this screen to any doctor who needs your history.</p>
    </div>
  );
}
