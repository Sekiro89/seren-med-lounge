'use client';

import { CalendarBlank, CalendarPlus } from '@phosphor-icons/react';
import {
  ButtonLink,
  Card,
  CardsSkeleton,
  Chip,
  DateTile,
  EmptyState,
  ErrorNote,
  LinkCard,
  PageTitle,
  SectionHeading,
} from '../../../components/ui';
import { doctorName, formatDay, formatTime, relativeDay } from '../../../lib/format';
import type { Appointment } from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';
import { isComingUp, ModeChip, visitStatus } from './shared';

/**
 * Appointments hub: book a visit, then what is coming up (soonest first)
 * and past visits (newest first). Each card opens the visit's own page.
 */
export default function AppointmentsPage() {
  const appointments = useApi<Appointment[]>('/patients/me/appointments');
  const now = useNow();

  const all = appointments.data ?? [];
  const upcoming = all
    .filter((a) => isComingUp(a, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = all
    .filter((a) => !isComingUp(a, now))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  return (
    <div>
      <PageTitle
        title="Appointments"
        description="Book a visit at the clinic or by video, and see your visits."
      />

      <div className="mb-10 sm:w-fit">
        <ButtonLink
          href="/appointments/book"
          full
          icon={<CalendarPlus size={22} aria-hidden="true" />}
        >
          Book a visit
        </ButtonLink>
      </div>

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
                description="Book a visit at the clinic or a video consultation, and it will show up here."
                action={
                  <ButtonLink
                    href="/appointments/book"
                    icon={<CalendarPlus size={22} aria-hidden="true" />}
                  >
                    Book a visit
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <UpcomingCard appointment={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="past-visits">
            <SectionHeading>
              <span id="past-visits">Past</span>
            </SectionHeading>
            {past.length === 0 ? (
              <Card>
                <p className="text-fg-muted">Your past visits will be listed here.</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {past.map((a) => (
                  <li key={a.id}>
                    <PastCard appointment={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function UpcomingCard({ appointment }: { appointment: Appointment }) {
  const status = visitStatus(appointment.status, true);
  return (
    <LinkCard href={`/appointments/${appointment.id}`}>
      <div className="flex gap-5">
        <DateTile iso={appointment.scheduledAt} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">
            {formatDay(appointment.scheduledAt)}, {formatTime(appointment.scheduledAt)}
          </p>
          <p className="text-fg-muted">
            With {doctorName(appointment.doctor)} · {relativeDay(appointment.scheduledAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ModeChip entrySource={appointment.entrySource} />
            <Chip tone={status.tone}>{status.label}</Chip>
          </div>
        </div>
      </div>
    </LinkCard>
  );
}

function PastCard({ appointment }: { appointment: Appointment }) {
  const status = visitStatus(appointment.status, false);
  return (
    <LinkCard href={`/appointments/${appointment.id}`}>
      <div className="flex gap-5">
        <DateTile iso={appointment.scheduledAt} muted />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {formatDay(appointment.scheduledAt)}, {formatTime(appointment.scheduledAt)}
          </p>
          <p className="text-fg-muted">With {doctorName(appointment.doctor)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ModeChip entrySource={appointment.entrySource} />
            <Chip tone={status.tone}>{status.label}</Chip>
          </div>
        </div>
      </div>
    </LinkCard>
  );
}
