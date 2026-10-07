'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarBlank, CaretLeft, CaretRight, ListNumbers, SignIn } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import {
  Figures,
  InkFilters,
  InkSection,
  InkSheet,
  InkStatus,
  MarginNote,
  RuledBar,
  SheetHead,
  SheetRail,
} from '../../../components/ui/ink';
import { LedgerTable, type LedgerColumn } from '../../../components/ui/ledger-table';
import { NoAccess } from '../../../components/ui/no-access';
import { Skeleton } from '../../../components/ui/skeleton';
import { clinicToday, formatLongDate, formatTime, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { ageLabel } from '../patients/_components/patient-shared';
import { CheckInDialog, type CheckInTarget } from './_components/check-in-dialog';
import { DayRuler } from './_components/day-ruler';

interface AppointmentRow {
  id: string;
  status: string;
  entrySource: string;
  scheduledAt: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phone: string;
    sex?: string | null;
  };
  doctor: { fullName: string } | null;
  encounter: {
    id: string;
    queueEntry: { tokenNumber: number; station: string; status: string } | null;
  } | null;
}

interface ClinicDay {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
}

type View = 'all' | 'to-come' | 'in' | 'done' | 'off';

const VIEWS: Record<View, (a: AppointmentRow) => boolean> = {
  all: () => true,
  'to-come': (a) => a.status === 'REQUESTED' || a.status === 'CONFIRMED',
  in: (a) => a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS',
  done: (a) => a.status === 'COMPLETED',
  off: (a) => a.status === 'CANCELLED' || a.status === 'NO_SHOW',
};

/** Everything the check-in dialog shows to confirm the right patient and booking. */
function identity(a: AppointmentRow): CheckInTarget {
  return {
    appointmentId: a.id,
    patientId: a.patient.id,
    patientName: fullName(a.patient),
    dateOfBirth: a.patient.dateOfBirth,
    phone: a.patient.phone,
    scheduledAt: a.scheduledAt,
    doctorName: a.doctor?.fullName,
    entrySource: a.entrySource,
  };
}

/** The clock for the "now" tick, refreshed each minute. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const tally = (rows: AppointmentRow[], key: (a: AppointmentRow) => string) => {
  const map = new Map<string, number>();
  for (const a of rows) map.set(key(a), (map.get(key(a)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

/**
 * The front desk's day as an agenda (design system 14a): the serif title
 * beside the day in figures, a ruler of the whole clinic's bookings, the
 * agenda ledger, and a rail with the day by doctor and by source.
 */
export default function AppointmentsPage() {
  const user = useStaff();
  const now = useMinute();
  const [date, setDate] = useState(clinicToday());
  const [view, setView] = useState<View>('all');
  const [checkIn, setCheckIn] = useState<CheckInTarget | null>(null);

  const allowed = can(user.role, 'appointment:read');
  const { data, loading, reload } = useApi<AppointmentRow[]>(
    allowed ? `/appointments?date=${date}` : null,
  );
  const week = useApi<ClinicDay[]>(allowed ? '/clinic/hours' : null);
  // Check-in opens the visit (appointment:write) and registers it, which
  // issues the queue token (patient:write).
  const canCheckIn = can(user.role, 'appointment:write') && can(user.role, 'patient:write');

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const columns: LedgerColumn<AppointmentRow>[] = [
    {
      header: 'Time',
      width: 'w-[76px]',
      numeric: true,
      render: (a) => formatTime(a.scheduledAt),
    },
    {
      header: 'Patient',
      render: (a) => (
        <span className="block min-w-0 leading-tight">
          <span
            className={`block truncate font-medium ${VIEWS.off(a) || VIEWS.done(a) ? '' : 'text-fg'}`}
          >
            {fullName(a.patient)}
          </span>
          <span className="tabular block truncate text-[12px] text-fg-muted">
            {a.patient.sex ? `${humanize(a.patient.sex)}, ` : ''}
            {ageLabel(a.patient.dateOfBirth)} · <span className="font-mono">{a.patient.phone}</span>
          </span>
        </span>
      ),
    },
    {
      header: 'Doctor',
      render: (a) => a.doctor?.fullName ?? <span className="text-fg-subtle">Unassigned</span>,
    },
    {
      header: 'Source',
      render: (a) => <span className="text-fg-muted">{humanize(a.entrySource)}</span>,
    },
    {
      header: 'Token',
      width: 'w-[64px]',
      numeric: true,
      render: (a) => {
        const token = a.encounter?.queueEntry;
        return token ? (
          <span className="font-medium">{String(token.tokenNumber).padStart(3, '0')}</span>
        ) : (
          <span className="text-fg-subtle">-</span>
        );
      },
    },
    {
      header: 'Status',
      width: 'w-[120px]',
      render: (a) => <InkStatus domain="appointment" status={a.status} />,
    },
    {
      header: 'Action',
      align: 'right',
      render: (a) => {
        if (a.encounter) {
          const token = a.encounter.queueEntry;
          return (
            <div className="flex items-center justify-end gap-4">
              {token ? (
                <span className="text-[12px] text-fg-muted">
                  {token.status === 'COMPLETED' ? 'Done' : `At ${humanize(token.station)}`}
                </span>
              ) : (
                canCheckIn && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ListNumbers size={16} aria-hidden="true" />}
                    onClick={() =>
                      setCheckIn({
                        ...identity(a),
                        encounterId: a.encounter?.id,
                      })
                    }
                  >
                    Add to queue
                  </Button>
                )
              )}
              <Link
                href={`/encounters/${a.encounter.id}`}
                className="whitespace-nowrap text-[13px] font-medium text-primary hover:text-primary-hover"
              >
                Open visit
              </Link>
            </div>
          );
        }
        if (canCheckIn && (a.status === 'REQUESTED' || a.status === 'CONFIRMED')) {
          return (
            <Button
              size="sm"
              icon={<SignIn size={16} aria-hidden="true" />}
              onClick={() => setCheckIn(identity(a))}
            >
              Check in
            </Button>
          );
        }
        return null;
      },
    },
  ];

  const shiftDay = (delta: number) => {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + delta);
    setDate(next.toISOString().slice(0, 10));
  };
  const isToday = date === clinicToday();
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const dayHours = week.data
    ? (() => {
        const d = week.data.find((w) => w.dayOfWeek === weekday);
        return d?.opensAt && d.closesAt ? d : null;
      })()
    : undefined;

  const all = data ?? [];
  const sorted = [...all].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const rows = data ? sorted.filter(VIEWS[view]) : undefined;
  const count = (v: View) => (data ? all.filter(VIEWS[v]).length : undefined);
  const active = all.filter((a) => !VIEWS.off(a));
  const byDoctor = tally(active, (a) => a.doctor?.fullName ?? 'Unassigned');
  const bySource = tally(active, (a) => humanize(a.entrySource));
  const maxDoctor = Math.max(1, ...byDoctor.map(([, n]) => n));
  const maxSource = Math.max(1, ...bySource.map(([, n]) => n));
  const firstToCome = isToday
    ? sorted.find(
        (a) => VIEWS['to-come'](a) && new Date(a.scheduledAt).getTime() >= now - 15 * 60_000,
      )
    : undefined;

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow={formatLongDate(`${date}T12:00:00+05:30`)}
          title="Appointments"
          description="Booked and walk-in visits for the day, across every doctor."
          figures={
            <Figures
              loading={loading && !data}
              items={[
                { label: 'Booked', value: count('all') },
                { label: 'Still to come', value: count('to-come') },
                { label: 'In the clinic', value: count('in') },
                { label: 'Completed', value: count('done') },
                {
                  label: 'Cancelled or no-show',
                  value: count('off'),
                  tone: (count('off') ?? 0) > 0 ? 'danger' : undefined,
                },
              ]}
            />
          }
          action={
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                aria-label="Previous day"
                onClick={() => shiftDay(-1)}
                icon={<CaretLeft size={16} aria-hidden="true" />}
              />
              <label htmlFor="date" className="sr-only">
                Date
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="tabular h-8 rounded-control border border-control bg-surface px-2.5 font-mono text-[14px] text-fg"
              />
              <Button
                variant="secondary"
                size="sm"
                aria-label="Next day"
                onClick={() => shiftDay(1)}
                icon={<CaretRight size={16} aria-hidden="true" />}
              />
              {!isToday && (
                <Button variant="ghost" size="sm" onClick={() => setDate(clinicToday())}>
                  Today
                </Button>
              )}
            </div>
          }
        />

        {loading && !data ? (
          <div className="border-b border-line px-8 py-5">
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <DayRuler visits={all} isToday={isToday} now={now} hours={dayHours} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label="Agenda" className="min-w-0">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-2 sm:px-8">
              <h2 className="text-[14px] font-semibold text-fg">Agenda</h2>
              <InkFilters
                label="Show appointments"
                value={view}
                onChange={setView}
                options={[
                  { key: 'all', label: 'All', count: count('all') },
                  { key: 'to-come', label: 'To come', count: count('to-come') },
                  { key: 'in', label: 'In clinic', count: count('in') },
                  { key: 'done', label: 'Completed', count: count('done') },
                  { key: 'off', label: 'Cancelled', count: count('off') },
                ]}
              />
            </div>
            <LedgerTable
              columns={columns}
              rows={rows}
              getRowKey={(a) => a.id}
              loading={loading}
              muted={(a) => VIEWS.off(a) || VIEWS.done(a)}
              selectedKey={firstToCome?.id}
              minWidth={860}
              caption="Appointments for the day"
              empty={
                <EmptyState
                  icon={CalendarBlank}
                  title={view === 'all' ? 'No appointments on this day' : 'None in this view'}
                  description={
                    view === 'all'
                      ? 'Pick another date, or book a visit from Consultations.'
                      : 'Choose All to see every appointment on this day.'
                  }
                />
              }
            />
          </section>

          <SheetRail label="The day by doctor and source">
            <InkSection title="By doctor" meta={data ? `${active.length} visits` : undefined}>
              {loading && !data ? (
                <Skeleton className="mt-2 h-16 w-full" />
              ) : byDoctor.length === 0 ? (
                <MarginNote className="pt-2">No visits booked.</MarginNote>
              ) : (
                <ul className="divide-y divide-line">
                  {byDoctor.map(([name, n]) => (
                    <li key={name} className="py-2 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-fg">{name}</span>
                        <span className="tabular font-mono text-fg">{n}</span>
                      </div>
                      <RuledBar value={n} max={maxDoctor} className="mt-1.5" />
                    </li>
                  ))}
                </ul>
              )}
            </InkSection>

            <InkSection title="How they booked">
              {loading && !data ? (
                <Skeleton className="mt-2 h-16 w-full" />
              ) : bySource.length === 0 ? (
                <MarginNote className="pt-2">Nothing to show.</MarginNote>
              ) : (
                <ul className="divide-y divide-line">
                  {bySource.map(([source, n]) => (
                    <li key={source} className="py-2 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-fg">{source}</span>
                        <span className="tabular font-mono text-fg">{n}</span>
                      </div>
                      <RuledBar value={n} max={maxSource} tone="muted" className="mt-1.5" />
                    </li>
                  ))}
                </ul>
              )}
            </InkSection>

            <MarginNote>
              {canCheckIn
                ? 'Check in opens the visit and issues the queue token. The patient goes to Vitals first.'
                : 'Checking in is done at the front desk.'}
              {firstToCome && (
                <>
                  {' '}
                  Next to arrive:{' '}
                  <b className="font-medium text-fg">{fullName(firstToCome.patient)}</b> at{' '}
                  <span className="tabular font-mono text-fg">
                    {formatTime(firstToCome.scheduledAt)}
                  </span>
                  .
                </>
              )}
            </MarginNote>
          </SheetRail>
        </div>
      </InkSheet>

      <CheckInDialog target={checkIn} onClose={() => setCheckIn(null)} onDone={reload} />
    </>
  );
}
