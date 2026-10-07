'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarBlank, CaretLeft, CaretRight, SignIn } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../components/ui/button';
import { PersonCell } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/badge';
import { apiClient } from '../../../lib/api-client';
import { clinicToday, formatLongDate, formatTime, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';

interface AppointmentRow {
  id: string;
  status: string;
  entrySource: string;
  scheduledAt: string;
  patient: { firstName: string; lastName: string };
  doctor: { fullName: string } | null;
  encounter: { id: string } | null;
}

export default function AppointmentsPage() {
  const user = useStaff();
  const [date, setDate] = useState(clinicToday());
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  const allowed = can(user.role, 'appointment:read');
  const { data, loading, reload } = useApi<AppointmentRow[]>(
    allowed ? `/appointments?date=${date}` : null,
  );
  const canCheckIn = can(user.role, 'appointment:write');

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const checkIn = async (id: string) => {
    setBusyId(id);
    setError(undefined);
    try {
      await apiClient.post(`/appointments/${id}/check-in`);
      reload();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'This appointment can no longer be checked in.'
          : 'Check-in did not go through. Please try again.',
      );
    } finally {
      setBusyId(undefined);
    }
  };

  const columns: Column<AppointmentRow>[] = [
    {
      header: 'Time',
      render: (a) => <span className="tabular font-mono">{formatTime(a.scheduledAt)}</span>,
    },
    {
      header: 'Patient',
      render: (a) => <PersonCell name={fullName(a.patient)} />,
    },
    {
      header: 'Doctor',
      render: (a) => a.doctor?.fullName ?? <span className="text-fg-subtle">Unassigned</span>,
    },
    {
      header: 'Source',
      render: (a) => <span className="text-fg-muted">{humanize(a.entrySource)}</span>,
    },
    { header: 'Status', render: (a) => <StatusBadge domain="appointment" status={a.status} /> },
    {
      header: 'Action',
      align: 'right',
      render: (a) => {
        if (a.encounter) {
          return (
            <Link
              href={`/encounters/${a.encounter.id}`}
              className="text-[13px] font-medium text-primary hover:text-primary-hover"
            >
              Open visit
            </Link>
          );
        }
        if (canCheckIn && (a.status === 'REQUESTED' || a.status === 'CONFIRMED')) {
          return (
            <Button
              size="sm"
              icon={<SignIn size={16} aria-hidden="true" />}
              loading={busyId === a.id}
              onClick={() => checkIn(a.id)}
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
  const sorted = data && [...data].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const count = (status: string) => data?.filter((a) => a.status === status).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(`${date}T12:00:00+05:30`)}
        title="Appointments"
        description="Booked and walk-in visits for the day."
        action={
          <div className="flex items-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Previous day"
              onClick={() => shiftDay(-1)}
              icon={<CaretLeft size={16} aria-hidden="true" />}
            />
            <div>
              <label htmlFor="date" className="sr-only">
                Date
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-8 rounded-control border border-control bg-surface px-3 text-base text-fg"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Next day"
              onClick={() => shiftDay(1)}
              icon={<CaretRight size={16} aria-hidden="true" />}
            />
            {date !== clinicToday() && (
              <Button variant="ghost" size="sm" onClick={() => setDate(clinicToday())}>
                Today
              </Button>
            )}
          </div>
        }
      />

      {data && data.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge>{data.length} total</Badge>
          <Badge tone="info">
            {count('CHECKED_IN') + count('CONFIRMED')} arriving or checked in
          </Badge>
          <Badge tone="success">{count('COMPLETED')} completed</Badge>
          {count('CANCELLED') + count('NO_SHOW') > 0 && (
            <Badge tone="danger">
              {count('CANCELLED') + count('NO_SHOW')} cancelled or no-show
            </Badge>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {error}
        </p>
      )}

      <Card>
        <DataTable
          columns={columns}
          rows={sorted}
          getRowKey={(a) => a.id}
          loading={loading}
          empty={
            <EmptyState
              icon={CalendarBlank}
              title="No appointments on this day"
              description="Pick another date, or book a visit from the front desk."
            />
          }
        />
      </Card>
    </>
  );
}
