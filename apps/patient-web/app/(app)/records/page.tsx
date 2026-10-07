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
  Card,
  ErrorNote,
  IconBadge,
  LinkCard,
  PageTitle,
  SectionHeading,
  Skeleton,
  type Tone,
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
    tone: Tone;
    title: string;
    state: ApiState<unknown>;
    summary: string;
  }> = [
    {
      href: '/medicines',
      icon: Pill,
      tone: 'primary',
      title: 'Medicines',
      state: prescriptions,
      summary: takingNow > 0 ? `${takingNow} taking now` : 'Nothing to take right now',
    },
    {
      href: '/results',
      icon: Flask,
      tone: 'info',
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
      tone: 'success',
      title: 'Care plan',
      state: plans,
      summary: activePlan?.title ?? 'No care plan',
    },
    {
      href: '/appointments',
      icon: CalendarCheck,
      tone: 'neutral',
      title: 'Past visits',
      state: appointments,
      summary: pastVisits > 0 ? plural(pastVisits, 'visit', 'visits') : 'No visits yet',
    },
  ];

  return (
    <div>
      <PageTitle title="Records" description="Your health record in one place." />

      <div className="flex flex-col gap-4">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {hubs.map((hub) => (
            <li key={hub.href}>
              <LinkCard href={hub.href} className="h-full">
                <div className="flex items-center gap-4">
                  <IconBadge icon={hub.icon} tone={hub.tone} />
                  <div className="min-w-0">
                    <p className="font-bold">{hub.title}</p>
                    {hub.state.loading ? (
                      <Skeleton className="mt-1 h-5 w-32" />
                    ) : hub.state.error ? (
                      <p className="text-fg-muted">Tap to open</p>
                    ) : (
                      <p className="text-fg-muted">{hub.summary}</p>
                    )}
                  </div>
                </div>
              </LinkCard>
            </li>
          ))}
        </ul>

        <LinkCard href="/records/timeline">
          <div className="flex items-center gap-4">
            <IconBadge icon={ClockCounterClockwise} tone="primary" />
            <div className="min-w-0">
              <p className="font-bold">Your timeline</p>
              <p className="text-fg-muted">Everything in order, newest first</p>
            </div>
          </div>
        </LinkCard>

        <LinkCard href="/records/documents">
          <div className="flex items-center gap-4">
            <IconBadge icon={Folder} tone="neutral" />
            <div className="min-w-0">
              <p className="font-bold">Documents</p>
              {documents.loading ? (
                <Skeleton className="mt-1 h-5 w-32" />
              ) : documents.error ? (
                <p className="text-fg-muted">Tap to open</p>
              ) : (
                <p className="text-fg-muted">
                  {documentCount > 0
                    ? plural(documentCount, 'document on file', 'documents on file')
                    : 'No documents yet'}
                </p>
              )}
            </div>
          </div>
        </LinkCard>

        <section aria-labelledby="health-summary" className="mt-6">
          <SectionHeading>
            <span id="health-summary">Health summary</span>
          </SectionHeading>
          {diagnoses.loading || history.loading ? (
            <Skeleton className="h-56" />
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
    <Card>
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-fg-muted">
            <Heartbeat size={20} aria-hidden="true" />
            Conditions your doctor has noted
          </h3>
          {conditions.length === 0 ? (
            <p className="mt-2 text-fg-muted">None recorded.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {conditions.map(({ id, version }) => (
                <li key={id}>
                  <p className="font-semibold">{version.description}</p>
                  {version.icdCode && (
                    <p className="text-[0.88rem] text-fg-subtle">Code {version.icdCode}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line pt-6">
          <h3 className="flex items-center gap-2 font-bold text-fg-muted">
            <Warning size={20} aria-hidden="true" />
            Allergies
          </h3>
          {allergies.length === 0 ? (
            <p className="mt-2 text-fg-muted">No allergies recorded.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {allergies.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl bg-warning-bg px-4 py-3 text-warning-fg"
                >
                  <Warning size={22} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="font-semibold">
                    <span className="sr-only">Allergy: </span>
                    {a.description}
                    {a.status === 'RESOLVED' && (
                      <span className="font-normal"> · no longer a problem</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t border-line pt-5 text-fg-muted">
          Show this screen to any doctor who needs your history.
        </p>
      </div>
    </Card>
  );
}
