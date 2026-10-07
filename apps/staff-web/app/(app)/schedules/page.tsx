'use client';

import { useState } from 'react';
import { CalendarDots, Plus, X } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import {
  Figures,
  HATCH_STYLE,
  InkSection,
  InkSheet,
  SheetHead,
  StatusWord,
} from '../../../components/ui/ink';
import { Skeleton } from '../../../components/ui/skeleton';
import { apiClient } from '../../../lib/api-client';
import { humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { AddHoursDialog, DAYS, type Doctor } from './_components/add-hours-dialog';

interface Window {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

interface ClinicDay {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
}

interface Axis {
  from: number;
  to: number;
}

/** Monday first, the way the clinic reads its week. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const hm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutesOf = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * A doctor's week as rulers (design system 4, like the Today schedule):
 * one row per weekday on a shared hour axis, the clinic's closed time
 * hatched, and each block of consulting hours in cobalt tint with its
 * times in Plex Mono and a remove button.
 */
function WeekRuler({
  axis,
  windows,
  clinic,
  doctorName,
  onRemove,
}: {
  axis: Axis;
  windows: Window[];
  clinic: ClinicDay[] | undefined;
  doctorName: string;
  onRemove: (w: Window) => void;
}) {
  const span = axis.to - axis.from;
  const pct = (m: number) => ((Math.min(axis.to, Math.max(axis.from, m)) - axis.from) / span) * 100;
  const hours: number[] = [];
  for (let m = axis.from; m <= axis.to; m += 60) hours.push(m);
  return (
    <div className="mt-2">
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4">
        <span />
        <div className="relative h-5">
          {hours.map((m) => (
            <span
              key={m}
              className={`tabular absolute top-0 font-mono text-[11px] text-fg-muted ${
                m === axis.to ? '-translate-x-full' : m === axis.from ? '' : '-translate-x-1/2'
              }`}
              style={{ left: `${pct(m)}%` }}
            >
              {m / 60}
            </span>
          ))}
        </div>
      </div>
      <ul className="border-t border-line">
        {WEEK.map((day) => {
          const today = windows
            .filter((w) => w.dayOfWeek === day)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          const c = clinic?.find((d) => d.dayOfWeek === day);
          const closedZones: Array<[number, number]> = !clinic
            ? []
            : !c?.opensAt || !c.closesAt
              ? [[axis.from, axis.to]]
              : [
                  [axis.from, minutesOf(c.opensAt)],
                  [minutesOf(c.closesAt), axis.to],
                ];
          return (
            <li
              key={day}
              className="grid min-h-11 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 border-b border-line"
            >
              <span className="text-[13px] font-medium text-fg">
                {DAYS[day]}
                {today.length === 0 && (
                  <span className="block text-[11px] font-normal text-fg-subtle">Not working</span>
                )}
              </span>
              <div className="relative h-8">
                {closedZones
                  .filter(([a, b]) => b > a)
                  .map(([a, b]) => (
                    <div
                      key={a}
                      className="absolute inset-y-1"
                      style={{ ...HATCH_STYLE, left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }}
                    />
                  ))}
                <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
                {hours.map((m) => (
                  <div
                    key={m}
                    aria-hidden="true"
                    className="absolute bottom-0 h-1.5 w-px bg-control"
                    style={{ left: `${pct(m)}%` }}
                  />
                ))}
                {today.map((w) => {
                  const start = minutesOf(w.startTime);
                  const end = minutesOf(w.endTime);
                  return (
                    <div
                      key={w.id}
                      className="absolute inset-y-0.5 flex min-w-0 items-center justify-between gap-1 overflow-hidden border border-primary-line bg-primary-subtle pl-2 text-primary-subtle-fg"
                      style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
                    >
                      <span className="tabular truncate font-mono text-[12px]">
                        {hm(start)} to {hm(end)}
                        <span className="opacity-80"> · {w.slotMinutes} min</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(w)}
                        aria-label={`Remove ${DAYS[day]} ${w.startTime} to ${w.endTime} for ${doctorName}`}
                        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-surface"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Each doctor's weekly hours. Patients book online into exactly these
 * times (patient-web /appointments/book), so a doctor with no hours here
 * can't be booked online. Changes apply to new bookings only; visits
 * already booked are never moved.
 */
export default function SchedulesPage() {
  const user = useStaff();
  const allowed = can(user.role, 'schedule:manage');
  const doctors = useApi<Doctor[]>(allowed ? '/users/directory' : null);
  const windows = useApi<Window[]>(allowed ? '/doctor-availability' : null);
  const clinic = useApi<ClinicDay[]>(allowed ? '/clinic/hours' : null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ window: Window; doctor: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const doctorList = (doctors.data ?? []).filter(
    (d) => d.role === 'JUNIOR_DOCTOR' || d.role === 'SENIOR_DOCTOR',
  );
  const loading = doctors.loading || windows.loading;

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/doctor-availability/${removing.window.id}/deactivate`);
      setRemoving(undefined);
      windows.reload();
    } catch {
      setError('Those hours were not removed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const all = windows.data ?? [];
  const toMin = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const clinicDays = clinic.data ?? [];
  const edges = [
    ...all.flatMap((w) => [toMin(w.startTime), toMin(w.endTime)]),
    ...clinicDays.flatMap((d) =>
      d.opensAt && d.closesAt ? [toMin(d.opensAt), toMin(d.closesAt)] : [],
    ),
  ];
  const from = edges.length ? Math.floor(Math.min(...edges) / 60) * 60 : 8 * 60;
  const to = edges.length ? Math.ceil(Math.max(...edges) / 60) * 60 : 21 * 60;
  const axis: Axis = { from, to: Math.max(to, from + 60) };
  const withHours = doctorList.filter((d) => all.some((w) => w.doctorId === d.id)).length;
  const weeklyMinutes = all
    .filter((w) => doctorList.some((d) => d.id === w.doctorId))
    .reduce((sum, w) => sum + toMin(w.endTime) - toMin(w.startTime), 0);

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow="Front desk"
          title="Doctor schedules"
          description="The hours each doctor sees patients. Patients book online into these times."
          figures={
            <Figures
              loading={loading}
              items={[
                { label: 'Doctors', value: doctorList.length },
                {
                  label: 'Open for booking',
                  value: withHours,
                  tone: withHours < doctorList.length ? 'warning' : undefined,
                },
                {
                  label: 'Consulting a week',
                  value: Math.round((weeklyMinutes / 60) * 10) / 10,
                  unit: 'h',
                },
              ]}
            />
          }
          action={
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
              Add hours
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line px-5 py-2.5 text-[12px] text-fg-muted sm:px-8">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-4 border border-primary-line bg-primary-subtle"
            />
            Consulting hours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-4" style={HATCH_STYLE} />
            Clinic closed
          </span>
          <span>
            {clinic.data
              ? 'Clinic hours come from the clinic settings.'
              : clinic.loading
                ? ''
                : 'Clinic hours are not available; closed time is not shaded.'}
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-6 px-8 py-8">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : doctorList.length === 0 ? (
          <EmptyState
            icon={CalendarDots}
            title="No doctors yet"
            description="Add a junior or senior doctor under Staff and roles, then set their hours here."
          />
        ) : (
          <div className="flex flex-col gap-10 px-5 pb-10 pt-8 sm:px-8">
            {doctorList.map((doctor, index) => {
              const mine = all.filter((w) => w.doctorId === doctor.id);
              const minutes = mine.reduce(
                (sum, w) => sum + toMin(w.endTime) - toMin(w.startTime),
                0,
              );
              return (
                <InkSection
                  key={doctor.id}
                  id={`doc-${doctor.id}`}
                  number={index + 1}
                  title={doctor.fullName}
                  meta={
                    <>
                      {humanize(doctor.role)}
                      {mine.length > 0 && (
                        <>
                          {' '}
                          ·{' '}
                          <span className="tabular font-mono">
                            {Math.round((minutes / 60) * 10) / 10} h
                          </span>{' '}
                          a week
                        </>
                      )}
                    </>
                  }
                  action={
                    mine.length > 0 ? (
                      <StatusWord tone="success">Open for online booking</StatusWord>
                    ) : (
                      <StatusWord tone="warning">
                        No hours set: patients can’t book online
                      </StatusWord>
                    )
                  }
                >
                  <WeekRuler
                    axis={axis}
                    windows={mine}
                    clinic={clinic.data ? clinicDays : undefined}
                    doctorName={doctor.fullName}
                    onRemove={(w) => setRemoving({ window: w, doctor: doctor.fullName })}
                  />
                </InkSection>
              );
            })}
          </div>
        )}
      </InkSheet>

      <AddHoursDialog
        open={adding}
        doctors={doctorList}
        onClose={() => setAdding(false)}
        onSaved={windows.reload}
      />

      <Dialog
        open={removing !== undefined}
        onClose={() => !busy && setRemoving(undefined)}
        title="Remove these hours?"
        description={
          removing
            ? `${removing.doctor}, ${DAYS[removing.window.dayOfWeek]} ${removing.window.startTime} to ${removing.window.endTime}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(undefined)} disabled={busy}>
              Keep them
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              Remove hours
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          Patients will no longer be able to book these times online. Visits already booked are not
          changed or cancelled.
        </p>
        {error && (
          <p role="alert" className="mt-4 bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
