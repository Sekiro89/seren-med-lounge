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
import { PersonCell } from '../../../components/ui/avatar';
import { StatusBadge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { KpiTile } from '../../../components/ui/kpi-tile';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import {
  clinicToday,
  formatLongDate,
  formatMoney,
  formatTime,
  fullName,
  greetingName,
  humanize,
} from '../../../lib/format';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';

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
export default function TodayPage() {
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

  const tiles = [
    canAppointments && (
      <KpiTile
        key="appointments"
        label="Appointments today"
        value={appointments.data?.length}
        hint={
          schedule
            ? `${schedule.filter((a) => DONE.includes(a.status)).length} finished`
            : undefined
        }
        icon={CalendarBlank}
        href="/appointments"
        loading={appointments.loading}
      />
    ),
    canQueue && (
      <KpiTile
        key="queue"
        label="Patients waiting"
        value={waiting}
        hint="Across all stations"
        icon={ListNumbers}
        tone="info"
        href="/queue"
        loading={queue.loading}
      />
    ),
    canFollowUps && (
      <KpiTile
        key="followups"
        label="Follow-ups due today"
        value={followUps.data?.length}
        icon={CalendarCheck}
        tone="success"
        href="/follow-ups"
        loading={followUps.loading}
      />
    ),
    canPharmacy && (
      <KpiTile
        key="pharmacy"
        label="Prescriptions to prepare"
        value={pharmacy.data?.length}
        icon={FirstAidKit}
        tone="warning"
        href="/dispensing"
        loading={pharmacy.loading}
      />
    ),
    canInvoices && (
      <KpiTile
        key="invoices"
        label="Outstanding balance"
        value={outstanding === undefined ? undefined : formatMoney(outstanding)}
        hint={unpaid ? `${unpaid.length} unpaid invoices` : undefined}
        icon={Receipt}
        tone="warning"
        href="/billing"
        loading={invoices.loading}
      />
    ),
    canClaims && (
      <KpiTile
        key="claims"
        label="Patient claims to review"
        value={claims.data?.length}
        icon={IdentificationCard}
        tone="danger"
        href="/claims"
        loading={claims.loading}
      />
    ),
  ].filter(Boolean);

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

      {tiles.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {tiles}
        </div>
      )}

      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          {canAppointments && (
            <Card>
              <CardHeader
                title="Today's schedule"
                description={
                  nextUp
                    ? `Next up: ${fullName(nextUp.patient)} at ${formatTime(nextUp.scheduledAt)}`
                    : 'Booked and walk-in visits, earliest first'
                }
                action={
                  <Link
                    href="/appointments"
                    className="flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
                  >
                    View all <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                }
              />
              {appointments.loading ? (
                <div className="flex flex-col gap-3 p-5">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : schedule && schedule.length > 0 ? (
                <ul className="divide-y divide-line">
                  {schedule.map((a) => (
                    <li
                      key={a.id}
                      className={`flex items-center gap-4 px-5 py-3 ${
                        nextUp?.id === a.id ? 'bg-primary-subtle/60' : ''
                      }`}
                    >
                      <span className="tabular w-12 shrink-0 font-mono text-sm font-medium text-fg-muted">
                        {formatTime(a.scheduledAt)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <PersonCell
                          name={fullName(a.patient)}
                          sub={a.doctor?.fullName ?? 'No doctor assigned'}
                        />
                      </div>
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
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {canQueue && (
            <Card>
              <CardHeader title="Queue by station" description="Patients not yet completed" />
              <ul className="flex flex-col gap-3 px-5 py-4">
                {stationCounts.map(({ station, count }) => (
                  <li key={station}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-fg-muted">{humanize(station)}</span>
                      <span className="tabular font-mono font-semibold text-fg">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-200"
                        style={{ width: `${(count / busiest) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-3">
                <Link
                  href="/queue"
                  className="flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
                >
                  Open the queue board <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </Card>
          )}

          {anyAttentionSource && (
            <Card>
              <CardHeader title="Needs attention" />
              {attentionLoading ? (
                <div className="flex flex-col gap-3 p-5">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : attention.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-6 text-sm text-fg-muted">
                  <CheckCircle size={24} className="text-success-fg" aria-hidden="true" />
                  Nothing is waiting on you.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {attention.map(({ href, icon: IconComponent, text, count }) => (
                    <li key={text}>
                      <Link
                        href={href}
                        className="flex h-12 items-center gap-3 px-5 text-sm transition-colors hover:bg-surface-muted/70"
                      >
                        <IconComponent size={20} className="text-fg-subtle" aria-hidden="true" />
                        <span className="flex-1 text-fg">{text}</span>
                        <span className="tabular rounded-full bg-warning-bg px-2 py-0.5 font-mono text-xs font-semibold text-warning-fg">
                          {count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      {tiles.length === 0 && !canAppointments && !canQueue && (
        <Card>
          <EmptyState
            icon={CalendarBlank}
            title="Your workspace is on its way"
            description="Use the menu on the left to open the desks your role can use."
          />
        </Card>
      )}
    </>
  );
}
