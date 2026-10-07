'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarCheck,
  CaretRight,
  ClockCounterClockwise,
  CreditCard,
  FirstAidKit,
  Flask,
  Heartbeat,
  Notepad,
  Package,
  Pill,
  Receipt,
  Scissors,
  Stethoscope,
  TestTube,
  type Icon,
} from '@phosphor-icons/react';
import {
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  PageTitle,
  type Tone,
} from '../../../../components/ui';
import { clinicDayKey, formatDay, formatMonthYear, formatTime } from '../../../../lib/format';
import type { TimelineEntry, TimelineKind } from '../../../../lib/types';
import { useApi } from '../../../../lib/use-api';

type Filter = 'all' | 'visits' | 'medicines' | 'tests' | 'money';

const FILTERS: Array<{ id: Filter; label: string; kinds: TimelineKind[] | null }> = [
  { id: 'all', label: 'All', kinds: null },
  {
    id: 'visits',
    label: 'Visits',
    kinds: ['appointment', 'visit', 'vitals', 'note', 'diagnosis', 'procedure', 'follow_up'],
  },
  { id: 'medicines', label: 'Medicines', kinds: ['prescription', 'dispensing'] },
  { id: 'tests', label: 'Tests', kinds: ['lab_order', 'lab_result'] },
  { id: 'money', label: 'Money', kinds: ['invoice', 'payment'] },
];

const LOOK: Record<TimelineKind, { icon: Icon; tone: Tone }> = {
  appointment: { icon: CalendarCheck, tone: 'primary' },
  visit: { icon: Stethoscope, tone: 'primary' },
  vitals: { icon: Heartbeat, tone: 'neutral' },
  note: { icon: Notepad, tone: 'neutral' },
  diagnosis: { icon: FirstAidKit, tone: 'warning' },
  prescription: { icon: Pill, tone: 'success' },
  lab_order: { icon: TestTube, tone: 'info' },
  lab_result: { icon: Flask, tone: 'info' },
  procedure: { icon: Scissors, tone: 'warning' },
  dispensing: { icon: Package, tone: 'success' },
  invoice: { icon: Receipt, tone: 'warning' },
  payment: { icon: CreditCard, tone: 'success' },
  follow_up: { icon: ClockCounterClockwise, tone: 'primary' },
  history: { icon: Notepad, tone: 'neutral' },
};

/** Every internal status the API can send, in words. Unknown ones show nothing. */
const STATUS: Partial<Record<TimelineKind, Record<string, { label: string; tone: Tone }>>> = {
  appointment: {
    REQUESTED: { label: 'Waiting for the clinic to confirm', tone: 'warning' },
    CONFIRMED: { label: 'Confirmed', tone: 'success' },
    CHECKED_IN: { label: 'Checked in', tone: 'info' },
    COMPLETED: { label: 'Visited', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
    NO_SHOW: { label: 'Missed', tone: 'warning' },
  },
  visit: {
    OPEN: { label: 'In progress', tone: 'info' },
    IN_CONSULTATION: { label: 'With the doctor', tone: 'info' },
    CLOSED: { label: 'Finished', tone: 'neutral' },
  },
  prescription: { CANCELLED: { label: 'Stopped by your doctor', tone: 'neutral' } },
  lab_order: {
    ORDERED: { label: 'Ordered', tone: 'info' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  },
  procedure: {
    PLANNED: { label: 'Planned', tone: 'info' },
    SCHEDULED: { label: 'Scheduled', tone: 'info' },
    IN_PROGRESS: { label: 'In progress', tone: 'info' },
    COMPLETED: { label: 'Done', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  },
  dispensing: {
    PREPARED: { label: 'Ready to collect', tone: 'info' },
    HANDED_OVER: { label: 'Collected', tone: 'success' },
    OUT_FOR_DELIVERY: { label: 'On its way', tone: 'info' },
    DELIVERED: { label: 'Delivered', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  },
  invoice: {
    ISSUED: { label: 'To pay', tone: 'warning' },
    PARTIALLY_PAID: { label: 'Part paid', tone: 'warning' },
    PAID: { label: 'Paid', tone: 'success' },
    VOID: { label: 'Cancelled', tone: 'neutral' },
  },
  follow_up: {
    PENDING: { label: 'Coming up', tone: 'primary' },
    DONE: { label: 'Done', tone: 'success' },
    MISSED: { label: 'Missed', tone: 'warning' },
    ESCALATED: { label: 'The clinic will contact you', tone: 'info' },
    CANCELLED: { label: 'No longer needed', tone: 'neutral' },
  },
  history: { RESOLVED: { label: 'No longer a problem', tone: 'neutral' } },
};

/** The API sends a follow-up's type lowercased ("review appointment"); say it as the Care page does. */
const FOLLOW_UP_DETAIL: Record<string, string> = {
  'review appointment': 'Review visit',
  'medication reminder': 'Medicine check',
  'recovery check': 'Recovery check-in from the clinic',
  'report alert': 'Report check',
  other: 'Follow-up',
};

const TITLE: Partial<Record<TimelineKind, string>> = {
  vitals: 'Check-up readings',
  history: 'Added to your history',
  payment: 'Payment made',
};

/** Where the full record lives in this app, if anywhere. */
function target(entry: TimelineEntry): string | null {
  switch (entry.kind) {
    case 'appointment':
      return `/appointments/${entry.entityId}`;
    case 'visit':
      return entry.appointmentId ? `/appointments/${entry.appointmentId}` : '/appointments';
    case 'prescription':
    case 'dispensing':
      return '/medicines';
    case 'lab_order':
    case 'lab_result':
      return '/results';
    case 'invoice':
    case 'payment':
      return '/bills';
    case 'follow_up':
      return '/care';
    default:
      return null;
  }
}

/** "Type 2 diabetes (E11.9)" -> the words, with the code kept small and secondary (18.3). */
function splitCode(detail: string): { text: string; code: string | null } {
  const m = detail.match(/^(.*?)\s*\(([A-Z]\d{2}(?:\.\d{1,4})?)\)$/);
  return m ? { text: m[1]!, code: m[2]! } : { text: detail, code: null };
}

function describe(entry: TimelineEntry): {
  title: string;
  detail: string | null;
  code: string | null;
} {
  const title = TITLE[entry.kind] ?? entry.title;
  if (entry.kind === 'follow_up') {
    const key = entry.detail?.toLowerCase() ?? '';
    return { title, detail: FOLLOW_UP_DETAIL[key] ?? entry.detail ?? null, code: null };
  }
  if (entry.kind === 'diagnosis' && entry.detail) {
    const { text, code } = splitCode(entry.detail);
    return { title, detail: text, code: entry.code ?? code };
  }
  return { title, detail: entry.detail ?? null, code: null };
}

interface Day {
  key: string;
  at: string;
  entries: TimelineEntry[];
}

interface Month {
  key: string;
  at: string;
  days: Day[];
}

/** Newest first, grouped by clinic month then clinic day. */
function group(entries: TimelineEntry[]): Month[] {
  const months: Month[] = [];
  for (const entry of entries) {
    const dayKey = clinicDayKey(entry.at);
    const monthKey = dayKey.slice(0, 7);
    let month = months.at(-1);
    if (!month || month.key !== monthKey) {
      month = { key: monthKey, at: entry.at, days: [] };
      months.push(month);
    }
    let day = month.days.at(-1);
    if (!day || day.key !== dayKey) {
      day = { key: dayKey, at: entry.at, entries: [] };
      month.days.push(day);
    }
    day.entries.push(entry);
  }
  return months;
}

/**
 * Everything in the patient's record in one list, newest first: visits,
 * medicines, tests, bills. Each row says what it is in plain words and
 * opens the page where the full record lives.
 */
export default function TimelinePage() {
  const timeline = useApi<TimelineEntry[]>('/patients/me/timeline');
  const [filter, setFilter] = useState<Filter>('all');

  const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? null;
  const sorted = [...(timeline.data ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const shown = kinds ? sorted.filter((e) => kinds.includes(e.kind)) : sorted;
  const months = group(shown);

  return (
    <div>
      <Link
        href="/records"
        className="-ml-2 mb-6 inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-primary"
      >
        <ArrowLeft size={20} aria-hidden="true" />
        Records
      </Link>

      <PageTitle title="Your timeline" description="Everything in your record, newest first." />

      <div className="flex flex-col gap-8">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.id)}
                className={`min-h-12 cursor-pointer rounded-full border px-5 font-semibold transition-colors active:scale-[0.98] ${
                  active
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-line bg-surface text-fg hover:bg-surface-muted'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {timeline.loading ? (
          <CardsSkeleton count={4} />
        ) : timeline.error ? (
          <ErrorNote message={timeline.error} onRetry={timeline.reload} />
        ) : months.length === 0 ? (
          <EmptyState
            icon={ClockCounterClockwise}
            title={filter === 'all' ? 'Nothing in your record yet' : 'Nothing here yet'}
            description={
              filter === 'all'
                ? 'Your visits, medicines, test results and bills will show up here as they happen.'
                : 'Try another group, or choose All to see everything.'
            }
          />
        ) : (
          <div className="flex flex-col gap-10">
            {months.map((month) => (
              <section key={month.key} aria-labelledby={`month-${month.key}`}>
                <h2 id={`month-${month.key}`} className="mb-4 text-[1.12rem] font-bold text-fg">
                  {formatMonthYear(month.at)}
                </h2>
                <div className="flex flex-col gap-6">
                  {month.days.map((day) => (
                    <DayGroup key={day.key} day={day} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DayGroup({ day }: { day: Day }) {
  return (
    <div>
      <h3 className="mb-3 font-semibold text-fg-muted">{formatDay(day.at)}</h3>
      <ol className="relative flex flex-col gap-3 pl-14 before:absolute before:bottom-5 before:left-5 before:top-5 before:w-0.5 before:bg-line">
        {day.entries.map((entry) => (
          <li key={entry.id} className="relative">
            <Row entry={entry} />
          </li>
        ))}
      </ol>
    </div>
  );
}

const DOT_TONES: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-neutral-fg',
  primary: 'bg-primary-subtle text-primary-subtle-fg',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg',
};

function Row({ entry }: { entry: TimelineEntry }) {
  const look = LOOK[entry.kind] ?? { icon: Notepad, tone: 'neutral' as Tone };
  const status = entry.status ? STATUS[entry.kind]?.[entry.status] : undefined;
  const { title, detail, code } = describe(entry);
  const href = target(entry);

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-bold text-fg">{title}</p>
          <time dateTime={entry.at} className="shrink-0 text-sm text-fg-subtle">
            {formatTime(entry.at)}
          </time>
        </div>
        {detail && <p className="text-fg-muted">{detail}</p>}
        {code && <p className="text-sm text-fg-subtle">Code {code}</p>}
        {status && (
          <div className="mt-2">
            <Chip tone={status.tone}>{status.label}</Chip>
          </div>
        )}
      </div>
      {href && (
        <CaretRight size={20} className="shrink-0 self-center text-fg-subtle" aria-hidden="true" />
      )}
    </>
  );

  return (
    <>
      <span
        className={`absolute -left-14 top-2 flex size-10 items-center justify-center rounded-full ring-4 ring-bg ${DOT_TONES[look.tone]}`}
        aria-hidden="true"
      >
        <look.icon size={20} />
      </span>
      {href ? (
        <Link
          href={href}
          className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition-transform active:scale-[0.99]"
        >
          {body}
        </Link>
      ) : (
        <div className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
          {body}
        </div>
      )}
    </>
  );
}
