'use client';

import { useState } from 'react';
import { CalendarDots, Plus, X } from '@phosphor-icons/react';
import { Avatar } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
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

/** Monday first, the way the clinic reads its week. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

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

  return (
    <>
      <PageHeader
        title="Doctor schedules"
        description="The hours each doctor sees patients. Patients book online into these times."
        action={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Add hours
          </Button>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : doctorList.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDots}
            title="No doctors yet"
            description="Add a junior or senior doctor under Staff and roles, then set their hours here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {doctorList.map((doctor) => {
            const mine = (windows.data ?? []).filter((w) => w.doctorId === doctor.id);
            return (
              <Card key={doctor.id}>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={doctor.fullName} size={40} />
                    <div>
                      <p className="font-semibold text-fg">{doctor.fullName}</p>
                      <p className="text-[13px] text-fg-muted">{humanize(doctor.role)}</p>
                    </div>
                  </div>
                  {mine.length > 0 ? (
                    <Badge tone="success">Open for online booking</Badge>
                  ) : (
                    <Badge tone="warning">No hours set: patients can’t book online</Badge>
                  )}
                </div>
                <ul className="divide-y divide-line">
                  {WEEK.map((day) => {
                    const today = mine
                      .filter((w) => w.dayOfWeek === day)
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    return (
                      <li
                        key={day}
                        className="grid grid-cols-[7rem_1fr] items-center gap-4 px-6 py-3.5"
                      >
                        <span className="text-sm font-medium text-fg">{DAYS[day]}</span>
                        {today.length === 0 ? (
                          <span className="text-sm text-fg-subtle">Not working</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {today.map((w) => (
                              <span
                                key={w.id}
                                className="tabular inline-flex items-center gap-2 rounded-control bg-primary-subtle py-1 pl-3 pr-1 text-sm text-primary-subtle-fg"
                              >
                                {w.startTime} to {w.endTime}
                                <span className="text-[12px] opacity-80">
                                  · {w.slotMinutes} min visits
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRemoving({ window: w, doctor: doctor.fullName })
                                  }
                                  aria-label={`Remove ${DAYS[day]} ${w.startTime} to ${w.endTime} for ${doctor.fullName}`}
                                  className="flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-surface"
                                >
                                  <X size={14} aria-hidden="true" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

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
          <p
            role="alert"
            className="mt-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
          >
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
