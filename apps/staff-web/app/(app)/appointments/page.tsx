'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarBlank, CaretLeft, CaretRight, ListNumbers, SignIn } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { PersonCell } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/badge';
import { clinicToday, formatLongDate, formatTime, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { ageLabel } from '../patients/_components/patient-shared';
import { CheckInDialog, type CheckInTarget } from './_components/check-in-dialog';

interface AppointmentRow {
  id: string;
  status: string;
  entrySource: string;
  scheduledAt: string;
  patient: { id: string; firstName: string; lastName: string; dateOfBirth: string; phone: string };
  doctor: { fullName: string } | null;
  encounter: {
    id: string;
    queueEntry: { tokenNumber: number; station: string; status: string } | null;
  } | null;
}

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

export default function AppointmentsPage() {
  const user = useStaff();
  const [date, setDate] = useState(clinicToday());
  const [checkIn, setCheckIn] = useState<CheckInTarget | null>(null);

  const allowed = can(user.role, 'appointment:read');
  const { data, loading, reload } = useApi<AppointmentRow[]>(
    allowed ? `/appointments?date=${date}` : null,
  );
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

  const columns: Column<AppointmentRow>[] = [
    {
      header: 'Time',
      render: (a) => <span className="tabular font-mono">{formatTime(a.scheduledAt)}</span>,
    },
    {
      header: 'Patient',
      render: (a) => (
        <PersonCell
          name={fullName(a.patient)}
          sub={`${ageLabel(a.patient.dateOfBirth)} · ${a.patient.phone}`}
        />
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
    { header: 'Status', render: (a) => <StatusBadge domain="appointment" status={a.status} /> },
    {
      header: 'Action',
      align: 'right',
      render: (a) => {
        if (a.encounter) {
          const token = a.encounter.queueEntry;
          return (
            <div className="flex items-center justify-end gap-4">
              {token ? (
                <span className="text-[13px] text-fg-muted">
                  Token{' '}
                  <span className="tabular font-mono font-semibold text-fg">
                    {String(token.tokenNumber).padStart(3, '0')}
                  </span>
                  {token.status === 'COMPLETED' ? ' · Done' : ` · ${humanize(token.station)}`}
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
                className="text-[13px] font-medium text-primary hover:text-primary-hover"
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

      <CheckInDialog target={checkIn} onClose={() => setCheckIn(null)} onDone={reload} />
    </>
  );
}
