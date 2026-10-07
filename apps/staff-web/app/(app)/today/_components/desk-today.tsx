'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  CheckCircle,
  FirstAidKit,
  IdentificationCard,
  ListNumbers,
  Receipt,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { StatusBadge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import { RuledBar } from '../../../../components/ui/ink';
import { Skeleton } from '../../../../components/ui/skeleton';
import {
  clinicToday,
  formatLongDate,
  formatMoney,
  formatTime,
  fullName,
  greetingName,
  humanize,
} from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { clinicMinutes, hhmm, useNow } from './model';

interface AppointmentRow {
  id: string;
  status: string;
  scheduledAt: string;
  patient: { firstName: string; lastName: string };
  doctor: { fullName: string } | null;
}
interface QueueRow {
  id: string;
  station: string;
  status: string;
}
interface InvoiceRow {
  status: string;
  totalMinor: number;
  paidMinor: number;
}

const STATIONS = ['VITALS', 'JUNIOR_DOCTOR', 'SENIOR_DOCTOR', 'BILLING', 'PHARMACY', 'LAB'];
const DONE = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })
      .format(new Date())
      .slice(0, 2),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The API lists newest first; a day's schedule reads earliest first. */
function inTimeOrder<T extends { scheduledAt: string }>(rows: T[] | undefined): T[] | undefined {
  return rows && [...rows].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/**
 * The day as a ruler (design system 4): the clinic's hours on a hairline,
 * a tick per appointment (ink once finished, cobalt still to come, grey if
 * cancelled) and a red tick at the current time. Decorative; the list
 * below carries the same appointments as text.
 */
function DayRuler({ rows, now }: { rows: AppointmentRow[]; now: number }) {
  const times = rows.map((a) => clinicMinutes(a.scheduledAt));
  const nowMin = clinicMinutes(now);
  const from = Math.min(8 * 60, ...times.map((t) => Math.floor(t / 60) * 60));
  const to = Math.min(
    24 * 60,
    Math.max(
      20 * 60,
      Math.ceil((nowMin + 1) / 60) * 60,
      ...times.map((t) => Math.ceil((t + 15) / 60) * 60),
    ),
  );
  const span = to - from;
  const pct = (m: number) => `${((m - from) / span) * 100}%`;
  const hours: number[] = [];
  for (let h = from; h <= to; h += 60) hours.push(h);
  return (
    <div aria-hidden="true" className="relative mx-5 h-14 sm:mx-8">
      <div className="absolute inset-x-0 top-5 h-px bg-control" />
      {hours.map((h) => (
        <div key={h} className="absolute top-5" style={{ left: pct(h) }}>
          <div className="h-1.5 w-px bg-control" />
          {(h - from) % 120 === 0 && (
            <span className="tabular absolute top-2.5 -translate-x-1/2 font-mono text-[11px] text-fg-subtle">
              {hhmm(h)}
            </span>
          )}
        </div>
      ))}
      {rows.map((a, i) => {
        const done = DONE.includes(a.status);
        const off = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
        return (
          <span
            key={a.id}
            className={`absolute top-[11px] h-[9px] w-[5px] -translate-x-1/2 ${
              off ? 'bg-control' : done ? 'bg-fg' : 'bg-primary'
            }`}
            style={{ left: pct(times[i]!) }}
          />
        );
      })}
      {nowMin >= from && nowMin <= to && (
        <div className="absolute top-0 h-[26px]" style={{ left: pct(nowMin) }}>
          <div className="h-full w-[2px] -translate-x-1/2 bg-danger" />
          <span className="tabular absolute -top-0.5 left-1.5 font-mono text-[11px] font-medium text-danger-fg">
            {hhmm(nowMin)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The role's overview. Every tile and panel is gated by the same
 * permission as the API call behind it: a role never requests, or sees,
 * numbers it isn't allowed to.
 */
export function DeskToday() {
  const user = useStaff();
  const today = clinicToday();
  const role = user.role;
  const now = useNow();

  const canAppointments = can(role, 'appointment:read');
  const canQueue = can(role, 'queue:manage');
  const canFollowUps = can(role, 'follow-up:manage');
  const canPharmacy = can(role, 'pharmacy:dispense');
  const canInvoices = can(role, 'invoice:manage');
  const canClaims = can(role, 'patient:write');
  const canLeads = can(role, 'lead:read');
  const canInsurance = can(role, 'insurance:manage');
  const canProcedures = can(role, 'procedure:manage');
  const canCampaigns = can(role, 'campaign:manage');
  const canReviews = can(role, 'review:manage');

  const appointments = useApi<AppointmentRow[]>(
    canAppointments ? `/appointments?date=${today}` : null,
  );
  const queue = useApi<QueueRow[]>(canQueue ? '/queue' : null, 15_000);
  const followUps = useApi<unknown[]>(canFollowUps ? '/follow-ups?view=today' : null);
  const overdue = useApi<unknown[]>(canFollowUps ? '/follow-ups?view=overdue' : null);
  const pharmacy = useApi<unknown[]>(canPharmacy ? '/pharmacy/pending' : null);
  const invoices = useApi<InvoiceRow[]>(canInvoices ? '/invoices' : null);
  const claims = useApi<unknown[]>(canClaims ? '/patient-claims' : null);
  const leadsDue = useApi<Array<{ status: string }>>(canLeads ? '/leads?due=today' : null);
  const cases = useApi<Array<{ status: string }>>(canInsurance ? '/insurance/cases' : null);
  const procedures = useApi<Array<{ status: string }>>(canProcedures ? '/procedures' : null);
  const activeCampaigns = useApi<unknown[]>(canCampaigns ? '/campaigns?status=ACTIVE' : null);
  const toModerate = useApi<unknown[]>(canReviews ? '/reviews?moderationStatus=PENDING' : null);

  const schedule = inTimeOrder(appointments.data);
  const waiting = queue.data?.filter((e) => e.status === 'WAITING').length;
  const outstanding = invoices.data
    ?.filter((i) => i.status !== 'VOID')
    .reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0);
  const unpaid = invoices.data?.filter(
    (i) => i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID',
  );

  const stationCounts = STATIONS.map((station) => ({
    station,
    count: queue.data?.filter((e) => e.station === station && e.status !== 'COMPLETED').length ?? 0,
  }));
  const busiest = Math.max(1, ...stationCounts.map((s) => s.count));

  // The next person still to arrive (not yet checked in or finished).
  const nextUp = schedule?.find(
    (a) =>
      (a.status === 'REQUESTED' || a.status === 'CONFIRMED') &&
      a.scheduledAt >= new Date().toISOString(),
  );

  const attention: Array<{ href: string; icon: Icon; text: string; count: number }> = [];
  if ((overdue.data?.length ?? 0) > 0)
    attention.push({
      href: '/follow-ups',
      icon: CalendarCheck,
      text: 'Overdue follow-ups',
      count: overdue.data!.length,
    });
  if ((claims.data?.length ?? 0) > 0)
    attention.push({
      href: '/claims',
      icon: IdentificationCard,
      text: 'Patient claims to review',
      count: claims.data!.length,
    });
  if ((unpaid?.length ?? 0) > 0)
    attention.push({
      href: '/billing',
      icon: Receipt,
      text: 'Unpaid invoices',
      count: unpaid!.length,
    });
  if ((pharmacy.data?.length ?? 0) > 0)
    attention.push({
      href: '/dispensing',
      icon: FirstAidKit,
      text: 'Prescriptions to prepare',
      count: pharmacy.data!.length,
    });
  const attentionLoading =
    overdue.loading || claims.loading || invoices.loading || pharmacy.loading;
  const anyAttentionSource = canFollowUps || canClaims || canInvoices || canPharmacy;

  const openLeadsDue = leadsDue.data?.filter(
    (l) => l.status !== 'CONVERTED' && l.status !== 'LOST',
  ).length;
  const waitingOnInsurer = cases.data?.filter(
    (c) => c.status === 'PRE_AUTH_REQUESTED' || c.status === 'CLAIM_SUBMITTED',
  ).length;

  // Clinical Ink figures: label over a Plex Mono number, hairline between
  // them, no tiles. Each is gated by the permission behind its request.
  const figures: Array<{
    key: string;
    label: string;
    value: string | number | undefined;
    hint?: string;
    href: string;
    loading: boolean;
  }> = [];
  if (canAppointments)
    figures.push({
      key: 'appointments',
      label: 'Appointments today',
      value: appointments.data?.length,
      hint: schedule
        ? `${schedule.filter((a) => DONE.includes(a.status)).length} finished`
        : undefined,
      href: '/appointments',
      loading: appointments.loading,
    });
  if (canQueue)
    figures.push({
      key: 'queue',
      label: 'Patients waiting',
      value: waiting,
      hint: 'Across all stations',
      href: '/queue',
      loading: queue.loading,
    });
  if (canFollowUps)
    figures.push({
      key: 'followups',
      label: 'Follow-ups due today',
      value: followUps.data?.length,
      href: '/follow-ups',
      loading: followUps.loading,
    });
  if (canPharmacy)
    figures.push({
      key: 'pharmacy',
      label: 'Prescriptions to prepare',
      value: pharmacy.data?.length,
      href: '/dispensing',
      loading: pharmacy.loading,
    });
  if (canInvoices)
    figures.push({
      key: 'invoices',
      label: 'Outstanding balance',
      value: outstanding === undefined ? undefined : formatMoney(outstanding),
      hint: unpaid ? `${unpaid.length} unpaid invoices` : undefined,
      href: '/billing',
      loading: invoices.loading,
    });
  if (canClaims)
    figures.push({
      key: 'claims',
      label: 'Patient claims to review',
      value: claims.data?.length,
      href: '/claims',
      loading: claims.loading,
    });

  const finished = schedule?.filter((a) => DONE.includes(a.status)).length ?? 0;
  const sideColumn = canQueue || anyAttentionSource;

  if (canLeads)
    figures.push({
      key: 'leads',
      label: 'Lead follow-ups due',
      value: openLeadsDue,
      href: '/leads',
      loading: leadsDue.loading,
    });
  if (canCampaigns)
    figures.push({
      key: 'campaigns',
      label: 'Active campaigns',
      value: activeCampaigns.data?.length,
      href: '/campaigns',
      loading: activeCampaigns.loading,
    });
  if (canReviews)
    figures.push({
      key: 'reviews',
      label: 'Reviews to moderate',
      value: toModerate.data?.length,
      href: '/reviews',
      loading: toModerate.loading,
    });
  if (canInsurance)
    figures.push(
      {
        key: 'cases',
        label: 'Open insurance cases',
        value: cases.data?.filter((c) => c.status !== 'SETTLED' && c.status !== 'CLOSED').length,
        href: '/insurance',
        loading: cases.loading,
      },
      {
        key: 'insurer',
        label: 'Waiting on insurer',
        value: waitingOnInsurer,
        href: '/insurance',
        loading: cases.loading,
      },
    );
  if (canProcedures)
    figures.push(
      {
        key: 'to-schedule',
        label: 'Procedures to schedule',
        value: procedures.data?.filter((p) => p.status === 'PLANNED').length,
        href: '/procedures',
        loading: procedures.loading,
      },
      {
        key: 'scheduled',
        label: 'Scheduled',
        value: procedures.data?.filter((p) => p.status === 'SCHEDULED').length,
        href: '/procedures',
        loading: procedures.loading,
      },
    );

  return (
    <div className="border border-line bg-surface">
      {/* Head: the serif greeting and the day in figures */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-5 border-b border-line px-5 pb-5 pt-6 sm:px-8">
        <div>
          <p className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            {formatLongDate(new Date())}
          </p>
          <h1 className="font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.01em] text-fg">
            {greeting()}, {greetingName(user.fullName)}
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            {humanize(user.role)}. Here is what needs attention today.
          </p>
        </div>
        {figures.length > 0 && (
          <dl className="flex flex-wrap items-start gap-y-4 lg:ml-auto">
            {figures.map((f, i) => (
              <Link
                key={f.key}
                href={f.href}
                className={`group block ${
                  i === 0
                    ? 'pr-7'
                    : i === figures.length - 1
                      ? 'border-l border-line pl-7'
                      : 'border-l border-line px-7'
                }`}
              >
                <dt className="whitespace-nowrap text-[12px] text-fg-muted group-hover:text-primary">
                  {f.label}
                </dt>
                <dd className="tabular mt-1 whitespace-nowrap font-mono text-[28px] leading-none text-fg">
                  {f.loading ? <Skeleton className="h-7 w-12" /> : (f.value ?? '-')}
                </dd>
                {f.hint && !f.loading && (
                  <dd className="mt-1.5 whitespace-nowrap text-[12px] text-fg-subtle">{f.hint}</dd>
                )}
              </Link>
            ))}
          </dl>
        )}
        {(canQueue || canAppointments) && (
          <div className="flex flex-wrap items-center gap-2">
            {canQueue && (
              <Link
                href="/queue"
                className="inline-flex h-9 items-center gap-2 rounded-control border border-control px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-muted"
              >
                <ListNumbers size={16} aria-hidden="true" />
                Open queue
              </Link>
            )}
            {canAppointments && (
              <Link
                href="/appointments"
                className="inline-flex h-9 items-center gap-2 rounded-control bg-primary px-3.5 text-[13px] font-medium text-on-primary transition-colors hover:bg-primary-hover"
              >
                <CalendarBlank size={16} aria-hidden="true" />
                Appointments
              </Link>
            )}
          </div>
        )}
      </div>

      {canAppointments && schedule && schedule.length > 0 && (
        <div className="border-b border-line pt-4">
          <DayRuler rows={schedule} now={now} />
        </div>
      )}

      <div
        className={`grid grid-cols-1 ${sideColumn && canAppointments ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}
      >
        {canAppointments && (
          <section
            aria-label="Today's schedule"
            className={sideColumn ? 'border-b border-line lg:border-b-0 lg:border-r' : ''}
          >
            <div className="flex h-11 items-center justify-between gap-4 border-b border-line px-5 sm:px-8">
              <h2 className="text-[14px] font-semibold text-fg">Today&apos;s schedule</h2>
              <Link
                href="/appointments"
                className="flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
              >
                View all <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] table-fixed text-[13px]">
                <caption className="sr-only">Today&apos;s appointments, earliest first</caption>
                <thead>
                  <tr className="h-8 border-b border-line text-left text-[11px] text-fg-muted">
                    <th scope="col" className="w-[92px] pl-5 font-medium sm:pl-8">
                      Time
                    </th>
                    <th scope="col" className="font-medium">
                      Patient
                    </th>
                    <th scope="col" className="w-[30%] font-medium">
                      Doctor
                    </th>
                    <th scope="col" className="w-[132px] pr-5 font-medium sm:pr-8">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.loading && !schedule ? (
                    [0, 1, 2, 3].map((i) => (
                      <tr key={i} className="h-11 border-b border-line">
                        <td colSpan={4} className="px-5 sm:px-8">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : schedule && schedule.length > 0 ? (
                    schedule.map((a) => {
                      const next = nextUp?.id === a.id;
                      const done = DONE.includes(a.status);
                      return (
                        <tr
                          key={a.id}
                          aria-current={next ? 'true' : undefined}
                          className={`h-11 border-b border-line ${next ? 'bg-primary-subtle' : ''}`}
                        >
                          <td
                            className={`tabular relative pl-5 font-mono sm:pl-8 ${done ? 'text-fg-subtle' : 'text-fg'}`}
                          >
                            {next && (
                              <span
                                aria-hidden="true"
                                className="absolute inset-y-0 left-0 w-[3px] bg-primary"
                              />
                            )}
                            {formatTime(a.scheduledAt)}
                          </td>
                          <td
                            className={`truncate pr-3 ${done ? 'text-fg-subtle' : 'font-medium text-fg'}`}
                          >
                            {fullName(a.patient)}
                            {next && (
                              <span className="ml-2 text-[12px] font-normal text-primary">
                                next
                              </span>
                            )}
                          </td>
                          <td className="truncate pr-3 text-fg-muted">
                            {a.doctor?.fullName ?? 'No doctor assigned'}
                          </td>
                          <td className="pr-5 sm:pr-8">
                            <StatusBadge domain="appointment" status={a.status} />
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState
                          icon={CalendarBlank}
                          title="No appointments today"
                          description="Booked and walk-in visits for today will appear here."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {schedule && schedule.length > 0 && (
              <p className="px-5 py-3 text-[12px] text-fg-muted sm:px-8">
                <span className="tabular font-mono text-fg">{schedule.length - finished}</span>{' '}
                still to come · <span className="tabular font-mono text-fg">{finished}</span>{' '}
                finished
                {nextUp && (
                  <>
                    {' '}
                    · next{' '}
                    <span className="tabular font-mono text-fg">
                      {formatTime(nextUp.scheduledAt)}
                    </span>
                  </>
                )}
              </p>
            )}
          </section>
        )}

        {sideColumn && (
          <div className="flex min-w-0 flex-col gap-8 px-5 pb-8 pt-5 sm:px-7">
            {canQueue && (
              <section aria-labelledby="desk-queue-h">
                <div className="section-rule flex min-h-10 items-center justify-between pt-1">
                  <h2 id="desk-queue-h" className="text-sm font-semibold text-fg">
                    Queue by station
                  </h2>
                  <span className="text-[12px] text-fg-muted">not yet completed</span>
                </div>
                <ul className="divide-y divide-line border-b border-line">
                  {stationCounts.map(({ station, count }) => (
                    <li
                      key={station}
                      className="grid grid-cols-[112px_minmax(0,1fr)_28px] items-center gap-3 py-2 text-[13px]"
                    >
                      <span className="text-fg-muted">{humanize(station)}</span>
                      <RuledBar value={count} max={busiest} />
                      <span className="tabular text-right font-mono text-fg">{count}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/queue"
                  className="mt-3 flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
                >
                  Open the queue board <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </section>
            )}

            {anyAttentionSource && (
              <section aria-labelledby="desk-attention-h">
                <div className="section-rule flex min-h-10 items-center pt-1">
                  <h2 id="desk-attention-h" className="text-sm font-semibold text-fg">
                    Needs attention
                  </h2>
                </div>
                {attentionLoading ? (
                  <div className="flex flex-col gap-3 py-3">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : attention.length === 0 ? (
                  <p className="flex items-center gap-2.5 py-3 text-[13px] text-fg-muted">
                    <CheckCircle size={18} className="text-success-fg" aria-hidden="true" />
                    Nothing is waiting on you.
                  </p>
                ) : (
                  <ul className="divide-y divide-line border-b border-line">
                    {attention.map(({ href, icon: IconComponent, text, count }) => (
                      <li key={text}>
                        <Link
                          href={href}
                          className="flex h-11 items-center gap-3 text-[13px] transition-colors hover:text-primary"
                        >
                          <IconComponent size={18} className="text-fg-subtle" aria-hidden="true" />
                          <span className="flex-1 text-fg">{text}</span>
                          <span className="tabular font-mono font-medium text-warning-fg">
                            {count}
                          </span>
                          <ArrowRight size={14} className="text-fg-subtle" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {!canAppointments && !sideColumn && (
        <p className="px-5 py-6 text-[13px] text-fg-muted sm:px-8">
          {figures.length > 0
            ? 'Select a figure to open the desk behind it. Everything else your role can use is under More.'
            : 'Use the More menu to open the desks your role can use.'}
        </p>
      )}
    </div>
  );
}
