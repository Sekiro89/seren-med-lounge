'use client';

import Link from 'next/link';
import {
  CalendarBlank,
  CalendarCheck,
  FirstAidKit,
  IdentificationCard,
  ListNumbers,
  Receipt,
} from '@phosphor-icons/react';
import { Card, CardHeader } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { KpiTile } from '../../../components/ui/kpi-tile';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/badge';
import {
  clinicToday,
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

/** The API lists newest first; a day's schedule reads earliest first. */
function inTimeOrder<T extends { scheduledAt: string }>(rows: T[] | undefined): T[] | undefined {
  return rows && [...rows].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

const STATIONS = ['VITALS', 'JUNIOR_DOCTOR', 'SENIOR_DOCTOR', 'BILLING', 'PHARMACY', 'LAB'];

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
  const pharmacy = useApi<unknown[]>(canPharmacy ? '/pharmacy/pending' : null);
  const invoices = useApi<InvoiceRow[]>(canInvoices ? '/invoices' : null);
  const claims = useApi<unknown[]>(canClaims ? '/patient-claims' : null);

  const waiting = queue.data?.filter((e) => e.status === 'WAITING').length;
  const outstanding = invoices.data
    ?.filter((i) => i.status !== 'VOID')
    .reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0);
  const stationCounts = STATIONS.map((station) => ({
    station,
    count: queue.data?.filter((e) => e.station === station && e.status !== 'COMPLETED').length ?? 0,
  }));

  const appointmentColumns: Column<AppointmentRow>[] = [
    {
      header: 'Time',
      render: (a) => <span className="tabular font-mono">{formatTime(a.scheduledAt)}</span>,
    },
    {
      header: 'Patient',
      render: (a) => <span className="font-medium">{fullName(a.patient)}</span>,
    },
    {
      header: 'Doctor',
      render: (a) => a.doctor?.fullName ?? <span className="text-fg-subtle">Unassigned</span>,
    },
    { header: 'Status', render: (a) => <StatusBadge domain="appointment" status={a.status} /> },
  ];

  const tiles = [
    canAppointments && (
      <KpiTile
        key="appointments"
        label="Appointments today"
        value={appointments.data?.length}
        icon={CalendarBlank}
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
        loading={queue.loading}
      />
    ),
    canFollowUps && (
      <KpiTile
        key="followups"
        label="Follow-ups due today"
        value={followUps.data?.length}
        icon={CalendarCheck}
        loading={followUps.loading}
      />
    ),
    canPharmacy && (
      <KpiTile
        key="pharmacy"
        label="Prescriptions to prepare"
        value={pharmacy.data?.length}
        icon={FirstAidKit}
        loading={pharmacy.loading}
      />
    ),
    canInvoices && (
      <KpiTile
        key="invoices"
        label="Outstanding balance"
        value={outstanding === undefined ? undefined : formatMoney(outstanding)}
        icon={Receipt}
        loading={invoices.loading}
      />
    ),
    canClaims && (
      <KpiTile
        key="claims"
        label="Patient claims to review"
        value={claims.data?.length}
        icon={IdentificationCard}
        loading={claims.loading}
      />
    ),
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${greetingName(user.fullName)}`}
        description={`${humanize(user.role)}. Here is what needs attention today.`}
      />

      {tiles.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles}</div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {canAppointments && (
          <Card>
            <CardHeader
              title="Today's appointments"
              action={
                <Link
                  href="/appointments"
                  className="text-[13px] font-medium text-primary hover:text-primary-hover"
                >
                  View all
                </Link>
              }
            />
            <DataTable
              columns={appointmentColumns}
              rows={inTimeOrder(appointments.data)}
              getRowKey={(a) => a.id}
              loading={appointments.loading}
              empty={
                <EmptyState
                  icon={CalendarBlank}
                  title="No appointments today"
                  description="Booked and walk-in visits for today will appear here."
                />
              }
            />
          </Card>
        )}

        {canQueue && (
          <Card>
            <CardHeader title="Queue by station" description="Patients not yet completed" />
            <ul className="divide-y divide-line">
              {stationCounts.map(({ station, count }) => (
                <li key={station} className="flex h-11 items-center justify-between px-5 text-sm">
                  <span className="text-fg-muted">{humanize(station)}</span>
                  <span className="tabular font-mono font-semibold text-fg">{count}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3">
              <Link
                href="/queue"
                className="text-[13px] font-medium text-primary hover:text-primary-hover"
              >
                Open the queue board
              </Link>
            </div>
          </Card>
        )}
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
