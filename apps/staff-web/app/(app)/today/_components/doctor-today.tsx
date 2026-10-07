'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus } from '@phosphor-icons/react';
import { usesQueue } from '@serenemed/permissions';
import { Skeleton } from '../../../../components/ui/skeleton';
import { clinicToday, fullName } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import {
  PHASE,
  ageYears,
  averageWait,
  buildRows,
  clinicMinutes,
  formatToken,
  useNow,
  type AgendaAppointment,
  type AgendaRow,
  type Availability,
  type Inbox,
  type QueueRow,
} from './model';
import { PatientSheet } from './patient-sheet';
import { ScheduleRuler, sessionLine } from './schedule-ruler';
import { SignatureRow } from './signature-row';

/** "Dr. Meera Iyer" -> "Dr. Meera"; "Meera Iyer" -> "Dr. Meera". */
function doctorName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const titled = /^dr\.?$/i.test(parts[0] ?? '');
  const first = titled ? parts[1] : parts[0];
  return `Dr. ${first ?? ''}`.trim();
}

function pickDefault(rows: AgendaRow[], now: number): AgendaRow | undefined {
  const nowMin = clinicMinutes(now);
  return (
    rows.find((r) => r.phase === 'ready' || r.phase === 'called') ??
    rows.find(
      (r) =>
        (r.phase === 'expected' || r.phase === 'vitals') &&
        clinicMinutes(r.appointment.scheduledAt) >= nowMin - 30,
    ) ??
    rows.find((r) => r.phase !== 'seen' && r.phase !== 'cancelled' && r.phase !== 'no-show') ??
    rows[0]
  );
}

/**
 * A doctor's Today (design system mockup 1): the day in four figures, the
 * schedule ruler, the agenda beside the selected patient's sheet, and the
 * strip of things that need the doctor's signature.
 */
export function DoctorToday() {
  const user = useStaff();
  const role = user.role;
  const now = useNow();
  const [today] = useState(clinicToday);
  const [weekday] = useState(() => new Date(`${clinicToday()}T00:00:00Z`).getUTCDay());
  const [scope, setScope] = useState<'mine' | 'clinic'>('mine');
  const [selectedId, setSelectedId] = useState<string>();

  const canAppointments = can(role, 'appointment:read');
  const queueRole = usesQueue(role);

  const availability = useApi<Availability[]>(
    canAppointments ? `/doctor-availability?doctorId=${user.id}` : null,
  );
  const mine = useApi<AgendaAppointment[]>(
    canAppointments ? `/appointments?doctorId=${user.id}&date=${today}` : null,
    30_000,
  );
  const clinic = useApi<AgendaAppointment[]>(
    canAppointments && scope === 'clinic' ? `/appointments?date=${today}` : null,
    30_000,
  );
  const queue = useApi<QueueRow[]>(queueRole ? '/queue' : null, 15_000);
  const inbox = useApi<Inbox>('/inbox', 60_000);

  const windows = (availability.data ?? []).filter((w) => w.dayOfWeek === weekday);
  const myRows = buildRows(mine.data, queue.data, now);
  const rows = scope === 'mine' ? myRows : buildRows(clinic.data, queue.data, now);
  const agendaLoading = scope === 'mine' ? mine.loading : clinic.loading;

  const active = myRows.filter((r) => r.phase !== 'cancelled' && r.phase !== 'no-show');
  const seen = active.filter((r) => r.phase === 'seen').length;
  const waitingForMe = active
    .filter((r) => r.phase === 'ready' || r.phase === 'called')
    .sort((a, b) => (a.queue?.waitingSince ?? '').localeCompare(b.queue?.waitingSince ?? ''));
  const avgWait = averageWait(active, now);

  const selected = rows.find((r) => r.appointment.id === selectedId) ?? pickDefault(rows, now);
  const nextOther = waitingForMe.find((r) => r.appointment.id !== selected?.appointment.id);
  const nextToken = nextOther?.queue?.tokenNumber;
  const waitingSummary =
    waitingForMe.length > 0
      ? `${waitingForMe.length} waiting for you${nextToken !== undefined ? ` · next ${formatToken(nextToken)}` : ''}`
      : undefined;

  const stillToCome = rows.filter(
    (r) => r.phase !== 'seen' && r.phase !== 'cancelled' && r.phase !== 'no-show',
  ).length;
  const seenInScope = rows.filter((r) => r.phase === 'seen').length;

  const refresh = () => {
    mine.reload();
    clinic.reload();
    queue.reload();
  };

  const figures: Array<{ label: string; value: number | undefined; unit?: string }> = [
    { label: 'Patients', value: mine.data ? active.length : undefined },
    { label: 'Seen', value: mine.data ? seen : undefined },
    { label: 'Waiting for you', value: mine.data ? waitingForMe.length : undefined },
    { label: 'Average wait', value: avgWait, unit: 'min' },
  ];

  return (
    <div className="border border-line bg-surface">
      {/* Head: serif title and the day in four figures */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-5 border-b border-line px-5 pb-5 pt-6 sm:px-8">
        <div>
          <h1 className="font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.01em] text-fg">
            Today, {doctorName(user.fullName)}
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            {availability.loading ? ' ' : sessionLine(windows, now)}
          </p>
        </div>
        <dl className="flex flex-wrap items-end gap-y-4 lg:ml-auto">
          {figures.map((f, i) => (
            <div
              key={f.label}
              className={
                i === 0
                  ? 'pr-7'
                  : i === figures.length - 1
                    ? 'border-l border-line pl-7'
                    : 'border-l border-line px-7'
              }
            >
              <dt className="text-[12px] text-fg-muted">{f.label}</dt>
              <dd className="tabular mt-1 font-mono text-[28px] leading-none text-fg">
                {mine.loading && !mine.data ? (
                  <Skeleton className="h-7 w-8" />
                ) : (
                  <>
                    {f.value ?? '—'}
                    {f.unit && f.value !== undefined && (
                      <span className="ml-1 text-[14px] text-fg-muted">{f.unit}</span>
                    )}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {can(role, 'follow-up:manage') && (
          <Link
            href="/follow-ups"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-control px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-muted"
          >
            <CalendarPlus size={16} aria-hidden="true" />
            Book follow-up
          </Link>
        )}
      </div>

      {canAppointments && (
        <ScheduleRuler windows={windows} rows={myRows} now={now} loading={availability.loading} />
      )}

      {/* Master / detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[40%_60%]">
        <section className="border-b border-line lg:border-b-0 lg:border-r" aria-label="Agenda">
          <div className="flex h-11 items-center justify-between border-b border-line px-8">
            <h2 className="text-[14px] font-semibold text-fg">Agenda</h2>
            <div
              className="flex items-center gap-4 text-[12px]"
              role="group"
              aria-label="Whose agenda"
            >
              {(['mine', 'clinic'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={`cursor-pointer pb-0.5 ${
                    scope === s
                      ? 'border-b-2 border-fg font-medium text-fg'
                      : 'border-b-2 border-transparent text-fg-muted hover:text-fg'
                  }`}
                >
                  {s === 'mine' ? 'Mine' : 'Whole clinic'}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] table-fixed text-[13px]">
              <thead>
                <tr className="h-8 border-b border-line text-left text-[11px] text-fg-muted">
                  <th className="w-[86px] pl-8 font-medium">Time</th>
                  <th className="w-[60px] font-medium">Token</th>
                  <th className="font-medium">Patient</th>
                  <th className="w-[112px] font-medium">Status</th>
                  <th className="w-[64px] pr-8 text-right font-medium">Wait</th>
                </tr>
              </thead>
              <tbody>
                {agendaLoading && rows.length === 0 ? (
                  [0, 1, 2, 3].map((i) => (
                    <tr key={i} className="h-[35px] border-b border-line">
                      <td colSpan={5} className="px-8">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-8 text-center text-[13px] text-fg-muted">
                      {scope === 'mine'
                        ? 'No appointments with you today.'
                        : 'No appointments in the clinic today.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <AgendaLine
                      key={r.appointment.id}
                      row={r}
                      now={now}
                      selected={r.appointment.id === selected?.appointment.id}
                      showDoctor={scope === 'clinic'}
                      onSelect={() => setSelectedId(r.appointment.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-8 py-3 text-[12px] text-fg-muted">
            <span>
              <span className="tabular font-mono text-fg">{stillToCome}</span> still to come ·{' '}
              <span className="tabular font-mono text-fg">{seenInScope}</span> seen
            </span>
            {queueRole && (
              <Link
                href="/queue"
                className="inline-flex items-center gap-1 font-medium text-primary hover:text-primary-hover"
              >
                Open queue
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>

        <PatientSheet
          key={selected?.appointment.id ?? 'none'}
          row={selected}
          role={role}
          now={now}
          waitingSummary={waitingSummary}
          onChanged={refresh}
        />
      </div>

      <SignatureRow
        inbox={inbox.data}
        loading={inbox.loading}
        failed={inbox.errorStatus !== undefined && !inbox.data}
        signs={can(role, 'clinical-note:sign-off')}
      />
    </div>
  );
}

function AgendaLine({
  row,
  now,
  selected,
  showDoctor,
  onSelect,
}: {
  row: AgendaRow;
  now: number;
  selected: boolean;
  showDoctor: boolean;
  onSelect: () => void;
}) {
  const { appointment: a, phase, waitMinutes } = row;
  const done = phase === 'seen' || phase === 'cancelled' || phase === 'no-show';
  const token = row.queue?.tokenNumber ?? a.encounter?.queueEntry?.tokenNumber;
  const style = PHASE[phase];
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(a.scheduledAt));

  return (
    <tr
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`h-[35px] cursor-pointer border-b border-line outline-none transition-colors focus-visible:bg-primary-subtle ${
        selected ? 'bg-primary-subtle' : 'hover:bg-surface-muted'
      }`}
    >
      <td className={`tabular relative pl-8 font-mono ${done ? 'text-fg-subtle' : 'text-fg'}`}>
        {selected && (
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
        )}
        {time}
      </td>
      <td className={`tabular font-mono ${done ? 'text-fg-subtle' : 'font-medium text-fg'}`}>
        {token !== undefined ? formatToken(token) : '—'}
      </td>
      <td className={`truncate pr-3 ${done ? 'text-fg-subtle' : 'font-medium text-fg'}`}>
        {fullName(a.patient)}
        <span className="tabular ml-1.5 text-[12px] font-normal text-fg-muted">
          {ageYears(a.patient.dateOfBirth, now)}
          {showDoctor && a.doctor ? ` · ${a.doctor.fullName}` : ''}
        </span>
      </td>
      <td>
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] ${style.text}`}
        >
          <span aria-hidden="true" className={`size-1.5 shrink-0 ${style.marker}`} />
          {style.label}
        </span>
      </td>
      <td
        className={`tabular pr-8 text-right font-mono text-[12px] ${
          waitMinutes !== undefined && waitMinutes >= 20
            ? 'font-medium text-warning-fg'
            : 'text-fg-muted'
        }`}
      >
        {waitMinutes !== undefined ? `${waitMinutes}m` : '—'}
      </td>
    </tr>
  );
}
