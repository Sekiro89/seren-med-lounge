'use client';

import { use, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CaretLeft,
  Check,
  SealCheck,
  SignOut,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import { canActAtStation, type QueueStationKey } from '@serenemed/permissions';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { NoAccess } from '../../../../components/ui/no-access';
import { PageHeader } from '../../../../components/ui/page-header';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, fullName, humanize } from '../../../../lib/format';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { statusTone, type Tone } from '../../../../lib/status';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { DiagnosesSection } from './diagnoses-section';
import {
  DocRow,
  RangeRuler,
  SectionHeading,
  ageFrom,
  parseRange,
  parseValue,
  rangeFlag,
} from './document';
import { LabOrdersRail } from './lab-orders-section';
import { MetabolicSection } from './metabolic-section';
import {
  ConsultationNote,
  OtherNotes,
  SOAP,
  useNoteDraft,
  type SectionState,
} from './notes-section';
import { PrescriptionsRail } from './prescriptions-section';
import { ProceduresList, ReferralsList } from './readonly-sections';
import { VitalsLog, VitalsToday } from './vitals-section';
import {
  apiErrorMessage,
  isUnsigned,
  type EncounterDetail,
  type HistoryEntry,
  type PatientInfo,
  type Vital,
} from './types';

const CLINIC_NAME = 'SereneMed Lounge';

/** Desks a doctor hands the patient on to after the consultation. */
const DESTINATIONS = ['LAB', 'BILLING', 'PHARMACY'] as const;
type Destination = (typeof DESTINATIONS)[number];
/** Token states the API accepts a move from (QueueService.move). */
const MOVABLE = ['WAITING', 'CALLED', 'IN_SERVICE', 'SKIPPED'];

/** Offset below the shell's sticky top bar (measured into --shell-top). */
const STICKY_TOP = 'top-[var(--shell-top,4rem)]';

interface LabOrderRow {
  id: string;
  status: string;
  createdAt: string;
  items: {
    id: string;
    testName: string;
    results: {
      id: string;
      resultValue: string;
      unit: string | null;
      referenceRange: string | null;
      createdAt: string;
    }[];
  }[];
}

interface TimelineEntry {
  id: string;
  kind: string;
  at: string;
  entityId: string;
}

interface RecentResult {
  testName: string;
  value: string;
  unit: string | null;
  range: string | null;
  at: string;
}

const tokenText = (n: number) => String(n).padStart(3, '0');

function MonoTime({ iso }: { iso: string }) {
  return <span className="font-mono text-fg">{formatTime(iso)}</span>;
}

/** The visit status shown under the token: one word, one tone (design system 2.3). */
function visitTag(encounter: EncounterDetail): { tone: Tone; label: string } {
  if (encounter.status !== 'OPEN') return { tone: 'success', label: 'Visit closed' };
  const q = encounter.queueEntry;
  if (!q) return { tone: 'info', label: 'Open visit' };
  if (
    (q.station === 'JUNIOR_DOCTOR' || q.station === 'SENIOR_DOCTOR') &&
    q.status === 'IN_SERVICE'
  ) {
    return { tone: 'info', label: 'In consultation' };
  }
  const word: Record<string, string> = {
    WAITING: 'Waiting',
    CALLED: 'Called',
    IN_SERVICE: 'At',
    COMPLETED: 'Done',
    SKIPPED: 'Skipped',
  };
  return {
    tone: statusTone('queue', q.status),
    label: `${word[q.status] ?? humanize(q.status)} · ${humanize(q.station).toLowerCase()}`,
  };
}

/** Allergy line under the 2px red rule (design system 8.1). */
function AllergyLine({
  allergies,
  conditions,
  state,
  compact = false,
}: {
  allergies: HistoryEntry[];
  conditions: HistoryEntry[];
  state: 'loading' | 'error' | 'ready';
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-danger text-[13px] ${
        compact ? 'py-1.5' : 'border-b border-b-line py-2'
      }`}
    >
      {state === 'loading' ? (
        <Skeleton className="h-4 w-48" />
      ) : state === 'error' ? (
        <span className="flex items-center gap-2 font-medium text-danger-fg">
          <Warning size={17} aria-hidden="true" />
          Allergies could not be loaded. Check the patient record before prescribing.
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
                <span className="ml-1.5 text-fg-muted">{humanize(a.severity).toLowerCase()}</span>
              )}
            </span>
          ))}
        </>
      ) : (
        <span className="text-neutral-fg">No known allergies</span>
      )}
      {!compact && state === 'ready' && conditions.length > 0 && (
        <span className="ml-auto flex flex-wrap gap-x-3">
          <span className="text-fg-muted">Conditions</span>
          <span className="text-fg">{conditions.map((c) => c.description).join(' · ')}</span>
        </span>
      )}
    </div>
  );
}

function RecentResults({ results }: { results: RecentResult[] | undefined }) {
  return (
    <div>
      <h3 className="border-b border-fg pb-1.5 text-[13px] font-semibold text-fg">
        Recent results
      </h3>
      {results === undefined ? (
        <Skeleton className="mt-2 h-12 w-full" />
      ) : results.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">No results on record.</p>
      ) : (
        <ul className="divide-y divide-line text-[13px]">
          {results.map((r) => {
            const range = parseRange(r.range);
            const value = parseValue(r.value);
            const flag = range && value !== undefined ? rangeFlag(value, range) : undefined;
            const out = flag === 'HIGH' || flag === 'LOW';
            return (
              <li key={r.testName} className="py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 truncate text-fg" title={r.testName}>
                    {r.testName}
                  </span>
                  <span
                    className={`ml-auto shrink-0 font-mono tabular ${out ? 'text-warning-fg' : 'text-fg'}`}
                  >
                    {r.value}
                    {r.unit ? (r.unit === '%' ? '%' : ` ${r.unit}`) : ''}
                  </span>
                  {flag && (
                    <span
                      className={`w-11 shrink-0 text-right text-[11px] font-semibold ${
                        out ? 'text-warning-fg' : 'text-success-fg'
                      }`}
                    >
                      {flag === 'HIGH' ? 'High' : flag === 'LOW' ? 'Low' : 'Normal'}
                    </span>
                  )}
                </div>
                {range && value !== undefined && <RangeRuler value={value} range={range} />}
                {r.range && (
                  <p className="mt-0.5 text-[11px] text-fg-muted">
                    normal {r.range} · {formatDate(r.at)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CurrentMedication({ entries }: { entries: HistoryEntry[] | undefined }) {
  return (
    <div>
      <h3 className="border-b border-fg pb-1.5 text-[13px] font-semibold text-fg">
        Current medication
      </h3>
      {entries === undefined ? (
        <Skeleton className="mt-2 h-12 w-full" />
      ) : entries.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">None recorded.</p>
      ) : (
        <ul className="divide-y divide-line text-[13px]">
          {entries.map((m) => (
            <li key={m.id} className="py-1.5 text-fg">
              {m.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const OUTLINE_WORD: Record<SectionState | 'unsigned', { label: string; className: string }> = {
  editing: { label: 'editing', className: 'text-primary' },
  unsaved: { label: 'unsaved', className: 'font-semibold text-warning-fg' },
  draft: { label: 'draft', className: 'text-fg-muted' },
  done: { label: 'done', className: 'text-success-fg' },
  empty: { label: 'empty', className: 'text-fg-subtle' },
  unsigned: { label: 'unsigned', className: 'font-semibold text-warning-fg' },
};

function Outline({
  items,
}: {
  items: { n: number; label: string; anchor: string; state: SectionState | 'unsigned' }[];
}) {
  return (
    <nav aria-labelledby="rail-outline">
      <h2 id="rail-outline" className="text-xs font-semibold text-fg-muted">
        Outline
      </h2>
      <ol className="mt-1 grid grid-cols-2 gap-x-5 text-[13px]">
        {items.map((item) => {
          const word = OUTLINE_WORD[item.state];
          const active = item.state === 'editing';
          return (
            <li key={item.n}>
              <a
                href={`#${item.anchor}`}
                className={`flex h-7 items-center gap-2 hover:underline ${active ? 'font-medium text-primary' : 'text-fg'}`}
              >
                <span className={`font-mono ${active ? '' : 'text-fg-subtle'}`}>{item.n}</span>
                <span className="truncate">{item.label}</span>
                <span className={`ml-auto shrink-0 text-[11px] ${word.className}`}>
                  {item.state === 'done' ? (
                    <>
                      <Check size={14} aria-hidden="true" />
                      <span className="sr-only">done</span>
                    </>
                  ) : (
                    word.label
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The doctor consultation workspace, laid out as the clinical document it
 * becomes (design system 14a): letterhead, context band, numbered
 * sections with margin notes, and a sticky rail for orders and finishing.
 * Every section keeps its own permission checks and endpoint.
 */
export default function EncounterWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStaff();
  const role = user.role;
  const [now] = useState(() => new Date());

  const allowed = can(role, 'patient-record:read-clinical');
  const {
    data: encounter,
    errorStatus,
    reload,
  } = useApi<EncounterDetail>(allowed ? `/encounters/${id}` : null);

  // Older API builds did not include the patient; fall back to the list.
  const needsPatientLookup =
    allowed && !!encounter && !encounter.patient && can(role, 'patient:read');
  const { data: patients } = useApi<PatientInfo[]>(needsPatientLookup ? '/patients' : null);
  const patient = encounter?.patient ?? patients?.find((p) => p.id === encounter?.patientId);
  const patientId = encounter?.patientId;

  const history = useApi<HistoryEntry[]>(
    allowed && patientId ? `/medical-history?patientId=${patientId}` : null,
  );
  const active = (category: string) =>
    history.data?.filter((h) => h.category === category && h.status === 'ACTIVE');
  const allergies = active('ALLERGY');
  const conditions = active('CONDITION') ?? [];
  const medication = active('CURRENT_MEDICATION');
  const historyState: 'loading' | 'error' | 'ready' =
    history.data !== undefined ? 'ready' : history.errorStatus !== undefined ? 'error' : 'loading';

  const labs = useApi<LabOrderRow[]>(
    allowed && patientId ? `/lab-orders?patientId=${patientId}` : null,
  );
  const timeline = useApi<TimelineEntry[]>(
    allowed && patientId ? `/patients/${patientId}/timeline` : null,
  );
  const previousVisit = encounter
    ? timeline.data
        ?.filter(
          (e) => e.kind === 'visit' && e.entityId !== encounter.id && e.at < encounter.startedAt,
        )
        .sort((a, b) => (a.at < b.at ? 1 : -1))[0]
    : undefined;
  const previousEncounter = useApi<EncounterDetail>(
    previousVisit ? `/encounters/${previousVisit.entityId}` : null,
  );
  const previousVital: { vital: Vital; date: string } | undefined = previousEncounter.data
    ?.vitals[0]
    ? {
        vital: previousEncounter.data.vitals[0],
        date: previousEncounter.data.vitals[0].recordedAt,
      }
    : undefined;

  const draft = useNoteDraft({
    encounterId: id,
    notes: encounter?.clinicalNotes ?? [],
    role,
    closed: encounter ? encounter.status !== 'OPEN' : true,
    onChange: reload,
  });

  // Sticky parts sit just below the shell's sticky top bar, whatever its height.
  const [shellTop, setShellTop] = useState(64);
  useEffect(() => {
    const header = document.querySelector('body header');
    if (!header) return;
    const update = () => setShellTop(Math.round(header.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // The slim identity strip appears once the letterhead scrolls away.
  const letterheadRef = useRef<HTMLDivElement>(null);
  const [showStrip, setShowStrip] = useState(false);
  const hasEncounter = !!encounter;
  useEffect(() => {
    const el = letterheadRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setShowStrip(!entry.isIntersecting), {
      rootMargin: `-${shellTop}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasEncounter, shellTop]);

  const [destination, setDestination] = useState<Destination | null>(null);
  const [finishing, setFinishing] = useState<'sign' | 'sign-send' | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const [discharging, setDischarging] = useState(false);
  const [dischargeBusy, setDischargeBusy] = useState(false);
  const [dischargeError, setDischargeError] = useState<string>();

  if (!allowed) {
    return <NoAccess homeHref={homeFor(role)} />;
  }

  if (errorStatus !== undefined && !encounter) {
    return (
      <>
        <PageHeader title="Consultation" />
        {errorStatus === 403 ? (
          <NoAccess homeHref={homeFor(role)} />
        ) : (
          <div role="alert" className="flex items-center justify-between gap-4 py-5">
            <p className="text-sm text-danger-fg">
              {errorStatus === 404
                ? "This visit doesn't exist or was removed."
                : 'Could not load this visit.'}
            </p>
            <Button variant="secondary" size="sm" onClick={reload}>
              Retry
            </Button>
          </div>
        )}
      </>
    );
  }

  if (!encounter) {
    return (
      <div aria-busy="true" className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="mx-auto w-full max-w-[1000px]">
          <Skeleton className="mb-4 h-40 w-full" />
          <Skeleton className="mb-4 h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="hidden h-[600px] w-full lg:block" />
      </div>
    );
  }

  const closed = encounter.status !== 'OPEN';
  const patientName = patient ? fullName(patient) : 'this patient';
  const queue = encounter.queueEntry;
  const tag = visitTag(encounter);

  // Unsigned records (design system 8.3).
  const unsignedNotes = encounter.clinicalNotes.filter((n) => isUnsigned(n.status));
  const unsignedDx = encounter.diagnoses.filter((d) => isUnsigned(d.status));
  const unsignedCount = unsignedNotes.length + unsignedDx.length;
  const draftCount = unsignedCount;

  // What this user may sign in one go.
  const canSignNotes = !closed && can(role, 'clinical-note:sign-off');
  const canSignDx = !closed && can(role, 'diagnosis:sign-off');
  const notesToSign = canSignNotes ? unsignedNotes : [];
  const dxToSign = canSignDx ? unsignedDx.filter((d) => d.versions[0]?.status === 'DRAFT') : [];
  const newNoteToSign = canSignNotes && !draft.note && draft.dirty;
  const signCount = notesToSign.length + dxToSign.length + (newNoteToSign ? 1 : 0);

  // Handing the token on (POST /queue/:id/move).
  const canMove =
    !closed &&
    !!queue &&
    MOVABLE.includes(queue.status) &&
    canActAtStation(role, queue.station as QueueStationKey);
  const destinations = DESTINATIONS.filter((d) => d !== queue?.station);
  const pendingLab = encounter.labOrders.some(
    (o) => o.status !== 'CANCELLED' && o.items.some((i) => i.results.length === 0),
  );
  const activeRx = encounter.prescriptions.some((p) => p.status === 'ACTIVE');
  const suggested: Destination = pendingLab ? 'LAB' : activeRx ? 'PHARMACY' : 'BILLING';
  const chosen: Destination =
    destination && destinations.includes(destination)
      ? destination
      : destinations.includes(suggested)
        ? suggested
        : (destinations[0] ?? 'BILLING');
  const stationLabel = humanize(chosen);

  // Context derived for the margin notes.
  const latestVital = encounter.vitals[0];
  const bpDelta =
    latestVital?.bloodPressureSystolic != null && previousVital?.vital.bloodPressureSystolic != null
      ? latestVital.bloodPressureSystolic - previousVital.vital.bloodPressureSystolic
      : undefined;

  const recentResults: RecentResult[] | undefined = labs.data
    ? (() => {
        const byTest = new Map<string, RecentResult>();
        for (const order of labs.data) {
          if (order.status === 'CANCELLED') continue;
          for (const item of order.items) {
            for (const r of item.results) {
              const seen = byTest.get(item.testName);
              if (!seen || seen.at < r.createdAt) {
                byTest.set(item.testName, {
                  testName: item.testName,
                  value: r.resultValue,
                  unit: r.unit,
                  range: r.referenceRange,
                  at: r.createdAt,
                });
              }
            }
          }
        }
        // Out-of-range values first (they are what the doctor needs), then newest.
        const outOfRange = (r: RecentResult) => {
          const range = parseRange(r.range);
          const value = parseValue(r.value);
          return range && value !== undefined && rangeFlag(value, range) !== 'NORMAL' ? 1 : 0;
        };
        return [...byTest.values()]
          .sort((a, b) => outOfRange(b) - outOfRange(a) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
          .slice(0, 3);
      })()
    : labs.errorStatus !== undefined
      ? []
      : undefined;

  const testCount = encounter.labOrders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((n, o) => n + o.items.length, 0);
  const medCount = encounter.prescriptions
    .filter((p) => p.status === 'ACTIVE')
    .reduce((n, p) => n + p.items.length, 0);

  const followUps = (encounter.carePlans ?? []).flatMap((c) => c.followUps);

  const finish = async (mode: 'sign' | 'sign-send' | 'send') => {
    setFinishBusy(true);
    setFinishError(undefined);
    try {
      let createdId: string | null = null;
      if (draft.dirty && draft.canWrite) {
        const saved = await draft.save();
        if (!saved) {
          setFinishError('The note could not be saved. Fix it in the document, then try again.');
          return;
        }
        if (!draft.note) createdId = saved;
      }
      if (mode !== 'send') {
        const noteIds = new Set(notesToSign.map((n) => n.id));
        if (createdId && canSignNotes) noteIds.add(createdId);
        for (const noteId of noteIds) {
          await apiClient.post(`/clinical-notes/${noteId}/sign-off`);
        }
        for (const dx of dxToSign) {
          await apiClient.post(`/diagnoses/${dx.id}/sign-off`);
        }
      }
      if (mode !== 'sign' && queue) {
        await apiClient.post(`/queue/${queue.id}/move`, { station: chosen });
      }
      setFinishing(null);
      reload();
    } catch (error) {
      setFinishError(
        apiErrorMessage(
          error,
          mode === 'send' ? 'Could not send the patient on.' : 'Could not finish signing.',
        ),
      );
      reload();
    } finally {
      setFinishBusy(false);
    }
  };

  const discharge = async () => {
    setDischargeBusy(true);
    setDischargeError(undefined);
    try {
      await apiClient.post(`/encounters/${encounter.id}/discharge`, {});
      setDischarging(false);
      reload();
    } catch (error) {
      setDischargeError(apiErrorMessage(error, 'Could not close this visit.'));
    } finally {
      setDischargeBusy(false);
    }
  };

  const identityLine = patient ? (
    <>
      {patient.sex ? `${patient.sex.charAt(0).toUpperCase()} · ` : ''}
      {ageFrom(patient.dateOfBirth, now)} yrs · born {formatDate(patient.dateOfBirth)}
      {patient.mrn ? (
        <>
          {' '}
          · MRN <span className="font-mono">{patient.mrn}</span>
        </>
      ) : null}{' '}
      · <span className="font-mono">{patient.phone}</span>
    </>
  ) : null;

  const unsignedWords =
    unsignedNotes.length > 0 && unsignedDx.length > 0
      ? 'Note and diagnosis are unsigned'
      : unsignedNotes.length > 0
        ? unsignedNotes.length === 1
          ? 'The note is unsigned'
          : `${unsignedNotes.length} notes are unsigned`
        : unsignedDx.length === 1
          ? 'The diagnosis is unsigned'
          : `${unsignedDx.length} diagnoses are unsigned`;

  const dxState: SectionState | 'unsigned' =
    encounter.diagnoses.length === 0 ? 'empty' : unsignedDx.length > 0 ? 'unsigned' : 'done';
  const outline = [
    ...SOAP.map((s, i) => ({
      n: i + 1,
      label: s.label,
      anchor: `sec-${s.key}`,
      state: draft.sectionState(s.key),
    })),
    { n: 5, label: 'Diagnosis', anchor: 'sec-diagnosis', state: dxState },
    {
      n: 6,
      label: 'Metabolic',
      anchor: 'sec-metabolic',
      state: (encounter.metabolicWorkups.length > 0 ? 'done' : 'empty') as SectionState,
    },
  ];

  const showFinishActions = !closed && (draft.editable || signCount > 0 || canMove);

  return (
    <div
      style={{ '--shell-top': `${shellTop}px` } as CSSProperties}
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_368px]"
    >
      {/* ── The clinical document ── */}
      <div className="@container min-w-0">
        {/* Identity and allergy stay visible on scroll (design system 8.1). */}
        <div className={`sticky ${STICKY_TOP} z-10 h-0`}>
          {showStrip && (
            <div className="mx-auto max-w-[1000px] @[880px]:pl-[180px]">
              <div className="border-x border-b border-line bg-surface px-5 sm:px-10">
                <div className="flex flex-wrap items-center gap-x-3 py-2 text-[13px]">
                  <span className="text-sm font-semibold text-fg">{patientName}</span>
                  <span className="text-fg-muted">{identityLine}</span>
                  {queue && (
                    <span className="ml-auto font-mono text-sm font-medium text-fg">
                      <span className="mr-1 font-sans text-xs font-normal text-fg-muted">
                        Token
                      </span>
                      {tokenText(queue.tokenNumber)}
                    </span>
                  )}
                </div>
                <AllergyLine
                  allergies={allergies ?? []}
                  conditions={conditions}
                  state={historyState}
                  compact
                />
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto max-w-[1000px]">
          <div className="mb-3 @[880px]:pl-[180px]">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
            >
              <CaretLeft size={16} aria-hidden="true" />
              Consultations
            </Link>
          </div>

          {!closed && unsignedCount > 0 && (
            <div className="mb-3 @[880px]:pl-[180px]">
              <p
                role="status"
                className="flex items-center gap-2 bg-warning-bg px-4 py-2.5 text-sm text-warning-fg"
              >
                <WarningCircle size={18} aria-hidden="true" />
                {unsignedCount === 1
                  ? 'One record on this visit is still a draft. A senior doctor must sign it off before discharge.'
                  : `${unsignedCount} records on this visit are still drafts. A senior doctor must sign them off before discharge.`}
              </p>
            </div>
          )}

          <article aria-label={`Consultation record for ${patientName}`}>
            {/* Letterhead */}
            <DocRow
              first
              marginClassName="pt-7"
              margin={
                <>
                  <p className="font-mono text-[11px] uppercase text-fg-muted">
                    Visit {formatDate(encounter.startedAt)}
                  </p>
                  <p className="mt-1">
                    Started <MonoTime iso={encounter.startedAt} />
                  </p>
                  {draft.note && isUnsigned(draft.note.status) && draft.latest && (
                    <p>
                      Draft saved <MonoTime iso={draft.latest.createdAt} />
                    </p>
                  )}
                  {closed && encounter.endedAt && (
                    <p>
                      Closed <MonoTime iso={encounter.endedAt} />
                    </p>
                  )}
                </>
              }
            >
              <div ref={letterheadRef} className="pb-4 pt-7">
                <div className="flex items-start gap-6">
                  <div className="min-w-0">
                    <p className="text-xs text-fg-muted">{CLINIC_NAME} · Consultation record</p>
                    <h1 className="mt-1.5 font-serif text-[32px] font-medium leading-[1.1] tracking-[-0.01em] text-fg">
                      {patient ? fullName(patient) : 'Patient record'}
                    </h1>
                    {identityLine && (
                      <p className="mt-1.5 text-[13px] text-fg-muted">{identityLine}</p>
                    )}
                    {encounter.registration && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                        {humanize(encounter.registration.visitType)} ·{' '}
                        {humanize(encounter.registration.consultationRoute)}
                        {encounter.registration.cancerScreeningRequired && (
                          <Badge tone="warning">Cancer screening required</Badge>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="ml-auto shrink-0 text-right">
                    {queue && (
                      <>
                        <p className="text-[11px] text-fg-muted">Token</p>
                        <p className="font-mono text-[30px] font-medium leading-none tabular text-fg">
                          {tokenText(queue.tokenNumber)}
                        </p>
                      </>
                    )}
                    <div className="mt-2">
                      <Badge tone={tag.tone}>{tag.label}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <AllergyLine
                    allergies={allergies ?? []}
                    conditions={conditions}
                    state={historyState}
                  />
                </div>
              </div>
            </DocRow>

            {/* Context band */}
            <DocRow
              marginClassName="pt-3"
              margin={
                <>
                  {latestVital && (
                    <p>
                      Vitals at <MonoTime iso={latestVital.recordedAt} />.
                    </p>
                  )}
                  {recentResults && recentResults[0] && (
                    <p>Results from {formatDate(recentResults[0].at).slice(0, 6)}.</p>
                  )}
                </>
              }
            >
              <div className="grid grid-cols-1 gap-6 pb-5 pt-2 @[700px]:grid-cols-[1fr_1.15fr_1fr] @[700px]:gap-7">
                <VitalsToday
                  encounterId={encounter.id}
                  vitals={encounter.vitals}
                  previous={previousVital}
                  role={closed ? undefined : role}
                  onChange={reload}
                />
                <RecentResults results={recentResults} />
                <CurrentMedication entries={medication} />
              </div>
            </DocRow>

            {/* 1 to 4: the note, written in place */}
            <ConsultationNote
              draft={draft}
              patientName={patientName}
              onChange={reload}
              headerMargin={
                draft.templateName ? (
                  <>
                    <p>Template</p>
                    <p className="font-medium text-fg">{draft.templateName}</p>
                  </>
                ) : undefined
              }
              margins={{
                subjective: encounter.registration?.notes ? (
                  <p>Check-in note: &ldquo;{encounter.registration.notes}&rdquo;</p>
                ) : undefined,
                objective:
                  bpDelta !== undefined && previousVital ? (
                    <p>
                      {bpDelta === 0
                        ? 'BP unchanged'
                        : `BP ${bpDelta < 0 ? 'down' : 'up'} ${Math.abs(bpDelta)}`}{' '}
                      since {formatDate(previousVital.date).slice(0, 6)}.
                    </p>
                  ) : !latestVital ? (
                    <p>No vitals recorded on this visit yet.</p>
                  ) : undefined,
                plan:
                  testCount + medCount > 0 ? (
                    <p>
                      {[
                        testCount > 0 && `${testCount} test${testCount === 1 ? '' : 's'}`,
                        medCount > 0 && `${medCount} medicine${medCount === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' and ')}{' '}
                      ordered in the rail.
                    </p>
                  ) : undefined,
              }}
            />

            {/* 5 Diagnosis */}
            <DocRow
              id="sec-diagnosis"
              margin={
                unsignedDx.length > 0 ? <p>Draft until a senior doctor signs it off.</p> : undefined
              }
            >
              <div className="pt-4">
                <SectionHeading number={5} title="Diagnosis" />
                <DiagnosesSection
                  encounterId={encounter.id}
                  diagnoses={encounter.diagnoses}
                  role={closed ? undefined : role}
                  patientName={patientName}
                  onChange={reload}
                />
              </div>
            </DocRow>

            {/* 6 Metabolic workup */}
            <DocRow id="sec-metabolic">
              <MetabolicSection
                number={6}
                encounterId={encounter.id}
                workups={encounter.metabolicWorkups}
                role={role}
                closed={closed}
                onChange={reload}
              />
            </DocRow>

            {/* 7 Other records */}
            <DocRow id="sec-other" last>
              <div className="pt-4">
                <SectionHeading number={7} title="Other records" />
                <div className="pl-6">
                  <OtherNotes
                    encounterId={encounter.id}
                    notes={encounter.clinicalNotes}
                    primaryId={draft.note?.id}
                    role={role}
                    patientName={patientName}
                    closed={closed}
                    onChange={reload}
                  />
                  <ReferralsList referrals={encounter.referrals} />
                  <ProceduresList procedures={encounter.procedures} />
                  {encounter.vitals.length > 1 && (
                    <div className="mt-4">
                      <h4 className="flex min-h-8 items-center border-b border-line text-[13px] font-semibold text-fg">
                        Vitals this visit
                      </h4>
                      <VitalsLog vitals={encounter.vitals} />
                    </div>
                  )}
                </div>
              </div>
            </DocRow>
          </article>
        </div>
      </div>

      {/* ── The rail: outline, orders, hand-off, finish ── */}
      <aside
        aria-label="Orders and finish"
        className={`mt-8 lg:sticky lg:mt-0 ${STICKY_TOP} lg:max-h-[calc(100dvh-var(--shell-top,4rem))] lg:self-start lg:overflow-y-auto lg:border-l lg:border-line lg:bg-surface lg:px-7 lg:pb-8 lg:pt-5`}
      >
        <div className="flex flex-col gap-4">
          <Outline items={outline} />

          <PrescriptionsRail
            encounterId={encounter.id}
            prescriptions={encounter.prescriptions}
            role={closed ? undefined : role}
            allergies={historyState === 'ready' ? (allergies ?? []) : undefined}
            onChange={reload}
          />

          <LabOrdersRail
            encounterId={encounter.id}
            labOrders={encounter.labOrders}
            role={closed ? undefined : role}
            onChange={reload}
          />

          {(followUps.length > 0 || encounter.referrals.length > 0) && (
            <section aria-labelledby="rail-next">
              <h2
                id="rail-next"
                className="section-rule flex min-h-10 items-center pt-1 text-sm font-semibold text-fg"
              >
                Next steps
              </h2>
              <ul className="divide-y divide-line text-[13px]">
                {followUps.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-1.5">
                    <span className="text-fg">
                      {humanize(f.type)} <span className="text-fg-muted">due</span>{' '}
                      <span className="font-mono">{formatDate(f.dueAt)}</span>
                    </span>
                    <span className="ml-auto">
                      <Badge tone={statusTone('followUp', f.status)}>{humanize(f.status)}</Badge>
                    </span>
                  </li>
                ))}
                {encounter.referrals.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-1.5">
                    <span className="text-fg">
                      Refer to {r.toSpecialty ?? r.toName ?? r.toFacility ?? humanize(r.type)}
                    </span>
                    <span className="ml-auto text-xs text-fg-muted">{humanize(r.status)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {closed ? (
            <section className="border-t-2 border-fg pt-3 text-[13px] text-fg-muted">
              <p className="font-medium text-fg">This visit is closed.</p>
              <p>
                {encounter.endedAt ? (
                  <>
                    Discharged {formatDate(encounter.endedAt)}{' '}
                    <span className="font-mono">{formatTime(encounter.endedAt)}</span>.{' '}
                  </>
                ) : null}
                The record is read only.
              </p>
            </section>
          ) : (
            <>
              {canMove && queue && destinations.length > 0 && (
                <fieldset>
                  <legend className="text-xs text-fg-muted">
                    Send patient to{' '}
                    <span className="text-fg-subtle">
                      (token now {humanize(queue.status).toLowerCase()} at{' '}
                      {humanize(queue.station).toLowerCase()})
                    </span>
                  </legend>
                  <div
                    className="mt-1.5 grid rounded-control border border-fg text-[13px] font-medium"
                    style={{
                      gridTemplateColumns: `repeat(${destinations.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {destinations.map((d, i) => (
                      <label
                        key={d}
                        className={`flex h-9 cursor-pointer items-center justify-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                          i > 0 ? 'border-l border-fg' : ''
                        } ${chosen === d ? 'bg-fg text-surface' : 'bg-surface text-fg hover:bg-surface-muted'}`}
                      >
                        <input
                          type="radio"
                          name="send-to"
                          value={d}
                          checked={chosen === d}
                          onChange={() => setDestination(d)}
                          className="sr-only"
                        />
                        {humanize(d)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {showFinishActions && (
                <section aria-label="Finish" className="border-t-2 border-fg pt-3">
                  {unsignedCount > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-warning-fg">
                      <WarningCircle size={16} aria-hidden="true" />
                      {unsignedWords}
                      {signCount === 0 ? '. A senior doctor signs them off.' : ''}
                    </p>
                  )}
                  {finishError && !finishing && (
                    <p role="alert" className="mt-2 text-[13px] text-danger-fg">
                      {finishError}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-col gap-2">
                    {canMove && destinations.length > 0 && (
                      <Button
                        className="w-full"
                        loading={finishBusy && !finishing}
                        onClick={() => {
                          setFinishError(undefined);
                          if (signCount > 0) setFinishing('sign-send');
                          else void finish('send');
                        }}
                      >
                        {signCount > 0 ? 'Sign and send to ' : 'Send to '}
                        {stationLabel}
                        <ArrowRight size={18} aria-hidden="true" />
                      </Button>
                    )}
                    {(signCount > 0 || draft.editable) && (
                      <div className="flex gap-2">
                        {signCount > 0 && (
                          <Button
                            variant="secondary"
                            className="flex-1 border-fg"
                            icon={<SealCheck size={18} aria-hidden="true" />}
                            onClick={() => {
                              setFinishError(undefined);
                              setFinishing('sign');
                            }}
                          >
                            {notesToSign.length + (newNoteToSign ? 1 : 0) > 0 && dxToSign.length > 0
                              ? 'Sign note & diagnosis'
                              : dxToSign.length > 0
                                ? 'Sign diagnosis'
                                : 'Sign note'}
                          </Button>
                        )}
                        {draft.editable && (
                          <Button
                            variant="secondary"
                            className={signCount > 0 ? '' : 'flex-1'}
                            loading={draft.busy && !finishBusy}
                            disabled={!draft.dirty}
                            onClick={() => void draft.save()}
                          >
                            {draft.amending ? 'Save amendment' : 'Save draft'}
                          </Button>
                        )}
                      </div>
                    )}
                    {draft.editable && !draft.dirty && (
                      <p className="text-xs text-fg-muted">
                        {draft.note ? 'All changes saved.' : 'Start writing to save a draft.'}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {can(role, 'patient-record:write-clinical') && (
                <div className="border-t border-line pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<SignOut size={18} aria-hidden="true" />}
                    onClick={() => {
                      setDischargeError(undefined);
                      setDischarging(true);
                    }}
                  >
                    Discharge patient
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <Dialog
        open={finishing !== null}
        onClose={() => !finishBusy && setFinishing(null)}
        title={finishing === 'sign-send' ? `Sign and send to ${stationLabel}` : 'Sign off records'}
        description={`For ${patientName}. Signing finalizes these records; later changes are recorded as amendments.${
          finishing === 'sign-send' && queue
            ? ` Then token ${tokenText(queue.tokenNumber)} moves to ${stationLabel.toLowerCase()}.`
            : ''
        }`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFinishing(null)} disabled={finishBusy}>
              Keep as draft
            </Button>
            <Button loading={finishBusy} onClick={() => finishing && void finish(finishing)}>
              {finishing === 'sign-send' ? `Sign and send to ${stationLabel}` : 'Sign off'}
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-line border-y border-line text-sm">
          {draft.dirty && draft.canWrite && (
            <li className="py-2 text-fg-muted">Your unsaved note changes are saved first.</li>
          )}
          {newNoteToSign && <li className="py-2 text-fg">Consultation note (new)</li>}
          {notesToSign.map((n) => (
            <li key={n.id} className="py-2 text-fg">
              {humanize(n.noteType)} note
              {n.versions[0] && (
                <span className="text-fg-muted">
                  , version <span className="font-mono">{n.versions[0].versionNumber}</span>
                </span>
              )}
            </li>
          ))}
          {dxToSign.map((d) => (
            <li key={d.id} className="py-2 text-fg">
              Diagnosis:{' '}
              {d.versions[0]?.icdCode && (
                <span className="font-mono">{d.versions[0].icdCode} </span>
              )}
              {d.versions[0]?.description}
            </li>
          ))}
        </ul>
        {finishError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-fg">
            {finishError}
          </p>
        )}
      </Dialog>

      <Dialog
        open={discharging}
        onClose={() => !dischargeBusy && setDischarging(false)}
        title="Discharge patient"
        description={`Close this visit for ${patientName}? The appointment is marked completed and the queue token is closed. Notes and diagnoses stay on record; nothing more can be added to this visit.`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDischarging(false)}
              disabled={dischargeBusy}
            >
              Keep visit open
            </Button>
            <Button loading={dischargeBusy} onClick={discharge}>
              Discharge patient
            </Button>
          </>
        }
      >
        {draftCount > 0 ? (
          <p className="bg-warning-bg px-3 py-2 text-sm text-warning-fg">
            {draftCount} unsigned draft{draftCount === 1 ? '' : 's'} on this visit. Sign them off
            first, or the discharge is refused.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">Everything on this visit is signed off.</p>
        )}
        {draft.dirty && (
          <p className="mt-2 text-sm text-warning-fg">
            The note has unsaved changes. Save or sign it before discharging.
          </p>
        )}
        {dischargeError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-fg">
            {dischargeError}
          </p>
        )}
      </Dialog>
    </div>
  );
}
