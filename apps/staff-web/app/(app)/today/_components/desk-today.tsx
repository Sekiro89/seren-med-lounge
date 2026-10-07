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
import { Button } from '../../../../components/ui/button';
import { EmptyState } from '../../../../components/ui/empty-state';
import { PageHeader } from '../../../../components/ui/page-header';
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
 * The role's overview. Every tile and panel is gated by the same
 * permission as the API call behind it: a role never requests, or sees,
 * numbers it isn't allowed to.
 */
export function DeskToday() {
  const user = useStaff();
  const today = clinicToday();
  const role = user.role;

  const canAppointments = can(role, 'appointment:read');
  const canQueue = can(role, 'queue:manage');
  const canFollowUps = can(role, 'follow-up:manage');
  const canPharmacy = can(role, 'pharmacy:dispense');
  const canInvoices = can(role, 'invoice:manage');
  const canClaims = can(role, 'patient:write');

  const appointments = useApi<AppointmentRow[]>(
    canAppointments ? `/appointments?date=${today}` : null,
  );
  const queue = useApi<QueueRow[]>(canQueue ? '/queue' : null, 15_000);
  const followUps = useApi<unknown[]>(canFollowUps ? '/follow-ups?view=today' : null);
  const overdue = useApi<unknown[]>(canFollowUps ? '/follow-ups?view=overdue' : null);
  const pharmacy = useApi<unknown[]>(canPharmacy ? '/pharmacy/pending' : null);
  const invoices = useApi<InvoiceRow[]>(canInvoices ? '/invoices' : null);
  const claims = useApi<unknown[]>(canClaims ? '/patient-claims' : null);

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

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(new Date())}
        title={`${greeting()}, ${greetingName(user.fullName)}`}
        description={`${humanize(user.role)}. Here is what needs attention today.`}
        action={
          <div className="flex gap-2">
            {canQueue && (
              <Link href="/queue">
                <Button variant="secondary" icon={<ListNumbers size={20} aria-hidden="true" />}>
                  Open queue
                </Button>
              </Link>
            )}
            {canAppointments && (
              <Link href="/appointments">
                <Button icon={<CalendarBlank size={20} aria-hidden="true" />}>Appointments</Button>
              </Link>
            )}
          </div>
        }
      />

      {figures.length > 0 && (
        <dl className="mb-10 grid grid-cols-2 gap-y-6 sm:grid-cols-3 xl:flex xl:flex-wrap">
          {figures.map((f, i) => (
            <Link
              key={f.key}
              href={f.href}
              className={`group block pr-8 ${i > 0 ? 'xl:border-l xl:border-line xl:pl-8' : ''}`}
            >
              <dt className="text-[12px] text-fg-muted group-hover:text-primary">{f.label}</dt>
              <dd className="tabular mt-1 font-mono text-[28px] leading-none text-fg">
                {f.loading ? <Skeleton className="h-7 w-16" /> : (f.value ?? '-')}
              </dd>
              {f.hint && <dd className="mt-1.5 text-[12px] text-fg-subtle">{f.hint}</dd>}
            </Link>
          ))}
        </dl>
      )}

      <div className="grid gap-10 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-10">
          {canAppointments && (
            <section aria-label="Today's schedule">
              <div className="section-rule flex items-start justify-between gap-4 pb-3 pt-3">
                <div>
                  <h2 className="text-[14px] font-semibold text-fg">Today&apos;s schedule</h2>
                  <p className="mt-0.5 text-[13px] text-fg-muted">
                    {nextUp
                      ? `Next up: ${fullName(nextUp.patient)} at ${formatTime(nextUp.scheduledAt)}`
                      : 'Booked and walk-in visits, earliest first'}
                  </p>
                </div>
                <Link
                  href="/appointments"
                  className="flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
                >
                  View all <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
              {appointments.loading ? (
                <div className="flex flex-col gap-3 py-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : schedule && schedule.length > 0 ? (
                <ul className="divide-y divide-line border-y border-line">
                  {schedule.map((a) => (
                    <li
                      key={a.id}
                      className={`relative flex items-center gap-4 px-3 py-2.5 ${
                        nextUp?.id === a.id ? 'bg-primary-subtle' : ''
                      }`}
                    >
                      {nextUp?.id === a.id && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-[3px] bg-primary"
                        />
                      )}
                      <span className="tabular w-12 shrink-0 font-mono text-[13px] text-fg-muted">
                        {formatTime(a.scheduledAt)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        <span className="font-medium text-fg">{fullName(a.patient)}</span>
                        <span className="ml-2 text-fg-muted">
                          {a.doctor?.fullName ?? 'No doctor assigned'}
                        </span>
                      </span>
                      <StatusBadge domain="appointment" status={a.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={CalendarBlank}
                  title="No appointments today"
                  description="Booked and walk-in visits for today will appear here."
                />
              )}
            </section>
          )}
        </div>

        <div className="flex flex-col gap-10">
          {canQueue && (
            <section aria-label="Queue by station">
              <div className="section-rule pb-3 pt-3">
                <h2 className="text-[14px] font-semibold text-fg">Queue by station</h2>
                <p className="mt-0.5 text-[13px] text-fg-muted">Patients not yet completed</p>
              </div>
              <ul className="divide-y divide-line border-y border-line">
                {stationCounts.map(({ station, count }) => (
                  <li key={station} className="flex items-center gap-3 py-2 text-[13px]">
                    <span className="w-28 shrink-0 text-fg-muted">{humanize(station)}</span>
                    <span className="h-1.5 flex-1 bg-surface-muted">
                      <span
                        className="block h-full bg-fg transition-[width] duration-200"
                        style={{ width: `${(count / busiest) * 100}%` }}
                      />
                    </span>
                    <span className="tabular w-6 text-right font-mono text-fg">{count}</span>
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
            <section aria-label="Needs attention">
              <div className="section-rule pb-3 pt-3">
                <h2 className="text-[14px] font-semibold text-fg">Needs attention</h2>
              </div>
              {attentionLoading ? (
                <div className="flex flex-col gap-3 py-3">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : attention.length === 0 ? (
                <div className="flex items-center gap-3 border-t border-line py-4 text-[13px] text-fg-muted">
                  <CheckCircle size={20} className="text-success-fg" aria-hidden="true" />
                  Nothing is waiting on you.
                </div>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {attention.map(({ href, icon: IconComponent, text, count }) => (
                    <li key={text}>
                      <Link
                        href={href}
                        className="flex h-11 items-center gap-3 text-[13px] transition-colors hover:text-primary"
                      >
                        <IconComponent size={18} className="text-fg-muted" aria-hidden="true" />
                        <span className="flex-1 text-fg">{text}</span>
                        <span className="tabular font-mono font-medium text-warning-fg">
                          {count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {figures.length === 0 && !canAppointments && !canQueue && (
        <EmptyState
          icon={CalendarBlank}
          title="Your workspace is on its way"
          description="Use the menu on the left to open the desks your role can use."
        />
      )}
    </>
  );
}
