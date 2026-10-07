'use client';

import { CalendarBlank, CalendarPlus } from '@phosphor-icons/react';
import {
  ButtonLink,
  CardsSkeleton,
  DateTile,
  EmptyState,
  ErrorNote,
  LinkCard,
  PageTitle,
  Rows,
  SectionHeading,
  StatusWord,
} from '../../../components/ui';
import { doctorName, formatTime, formatWeekdayShort, relativeDay } from '../../../lib/format';
import type { Appointment } from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';
import { isComingUp, visitStatus } from './shared';

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
        title="Visits"
        description="Book a visit at the clinic or by video, and see your visits."
      />

      <div className="mb-8 sm:w-fit">
        <ButtonLink
          href="/appointments/book"
          full
          icon={<CalendarPlus size={20} aria-hidden="true" />}
        >
          Book a visit
        </ButtonLink>
      </div>

      {appointments.loading ? (
        <CardsSkeleton count={3} />
      ) : appointments.error ? (
        <ErrorNote message={appointments.error} onRetry={appointments.reload} />
      ) : (
        <div className="flex flex-col gap-8">
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
                    icon={<CalendarPlus size={20} aria-hidden="true" />}
                  >
                    Book a visit
                  </ButtonLink>
                }
              />
            ) : (
              <Rows>
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <VisitRow appointment={a} upcoming />
                  </li>
                ))}
              </Rows>
            )}
          </section>

          <section aria-labelledby="past-visits">
            <SectionHeading>
              <span id="past-visits">Past</span>
            </SectionHeading>
            {past.length === 0 ? (
              <p className="border-b border-line py-4 text-fg-muted">
                Your past visits will be listed here.
              </p>
            ) : (
              <Rows>
                {past.map((a) => (
                  <li key={a.id}>
                    <VisitRow appointment={a} upcoming={false} />
                  </li>
                ))}
              </Rows>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function VisitRow({ appointment, upcoming }: { appointment: Appointment; upcoming: boolean }) {
  const status = visitStatus(appointment.status, upcoming);
  const iso = appointment.scheduledAt;
  const video = appointment.entrySource === 'VIDEO_CONSULTATION';
  return (
    <LinkCard href={`/appointments/${appointment.id}`}>
      <div className="flex gap-4">
        <DateTile iso={iso} muted={!upcoming} />
        <div className="min-w-0 flex-1">
          <p className={upcoming ? 'font-semibold' : 'font-medium'}>
            {formatWeekdayShort(iso)}, <span className="tabular font-mono">{formatTime(iso)}</span>
            {upcoming && <span className="font-normal text-fg-muted"> · {relativeDay(iso)}</span>}
          </p>
          <p className="text-fg-muted">
            {video ? <span className="text-primary">Video call</span> : 'At the clinic'} with{' '}
            {doctorName(appointment.doctor)}
          </p>
          <p className="mt-0.5">
            <StatusWord tone={status.tone}>{status.label}</StatusWord>
          </p>
        </div>
      </div>
    </LinkCard>
  );
}
