'use client';

import Link from 'next/link';
import { CalendarBlank, ChatCircleText } from '@phosphor-icons/react';
import {
  Card,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  IconBadge,
  PageTitle,
  SectionHeading,
  type Tone,
} from '../../../components/ui';
import {
  doctorName,
  formatDate,
  formatDay,
  formatDayNumber,
  formatMonthShort,
  formatTime,
  relativeDay,
} from '../../../lib/format';
import type { Appointment, AppointmentStatus } from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';

/** How a visit that has already happened reads to the patient. */
const PAST_STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  COMPLETED: { label: 'Visited', tone: 'success' },
  CHECKED_IN: { label: 'Visited', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  NO_SHOW: { label: 'Missed', tone: 'warning' },
  CONFIRMED: { label: 'Booked', tone: 'neutral' },
  REQUESTED: { label: 'Not confirmed', tone: 'neutral' },
};

/**
 * Upcoming visits first (soonest at the top), then past visits (most
 * recent first). Booking has no self-service backend yet, so the page says
 * how to book or change instead of offering a dead button (18.3).
 */
export default function VisitsPage() {
  const appointments = useApi<Appointment[]>('/patients/me/appointments');
  const now = useNow();

  const all = appointments.data ?? [];
  const isUpcoming = (a: Appointment) =>
    (a.status === 'CONFIRMED' || a.status === 'REQUESTED') &&
    new Date(a.scheduledAt).getTime() > now;
  const upcoming = all
    .filter(isUpcoming)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = all
    .filter((a) => !isUpcoming(a))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  return (
    <div>
      <PageTitle title="Visits" description="Your visits to the clinic, coming up and past." />

      {appointments.loading ? (
        <CardsSkeleton count={3} />
      ) : appointments.error ? (
        <ErrorNote message={appointments.error} onRetry={appointments.reload} />
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="coming-up">
            <SectionHeading>
              <span id="coming-up">Coming up</span>
            </SectionHeading>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarBlank}
                title="Nothing booked"
                description="When the clinic books a visit for you, it will show up here."
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <UpcomingVisit appointment={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="past-visits">
            <SectionHeading>
              <span id="past-visits">Past visits</span>
            </SectionHeading>
            {past.length === 0 ? (
              <Card>
                <p className="text-fg-muted">Your past visits will be listed here.</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {past.map((a) => (
                  <li key={a.id}>
                    <PastVisit appointment={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Card className="flex items-center gap-4">
            <IconBadge icon={ChatCircleText} tone="primary" />
            <p className="text-fg-muted">
              To book, change or cancel a visit, call the clinic or{' '}
              <Link href="/messages" className="font-semibold text-primary underline">
                send us a message
              </Link>
              .
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function UpcomingVisit({ appointment }: { appointment: Appointment }) {
  const confirmed = appointment.status === 'CONFIRMED';
  return (
    <Card as="article" className="flex gap-5">
      <div className="flex w-16 shrink-0 flex-col items-center justify-center self-start rounded-2xl bg-primary-subtle py-3 text-primary-subtle-fg">
        <span className="text-sm font-bold uppercase">
          {formatMonthShort(appointment.scheduledAt)}
        </span>
        <span className="tabular text-3xl font-bold leading-none">
          {formatDayNumber(appointment.scheduledAt)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">
          {formatDay(appointment.scheduledAt)}, {formatTime(appointment.scheduledAt)}
        </p>
        <p className="text-fg-muted">
          With {doctorName(appointment.doctor)} · {relativeDay(appointment.scheduledAt)}
        </p>
        <div className="mt-3">
          <Chip tone={confirmed ? 'success' : 'warning'}>
            {confirmed ? 'Confirmed' : 'Waiting for the clinic to confirm'}
          </Chip>
        </div>
      </div>
    </Card>
  );
}

function PastVisit({ appointment }: { appointment: Appointment }) {
  const status = PAST_STATUS[appointment.status];
  return (
    <Card as="article" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="font-bold">
          {formatDate(appointment.scheduledAt)}, {formatTime(appointment.scheduledAt)}
        </p>
        <p className="text-fg-muted">With {doctorName(appointment.doctor)}</p>
      </div>
      <Chip tone={status.tone}>{status.label}</Chip>
    </Card>
  );
}
