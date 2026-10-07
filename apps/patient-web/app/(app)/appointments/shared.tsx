'use client';

import { Buildings, VideoCamera } from '@phosphor-icons/react';
import { Chip, type Tone } from '../../../components/ui';
import type { Appointment, AppointmentStatus } from '../../../lib/types';

const ACTIVE: ReadonlySet<AppointmentStatus> = new Set(['REQUESTED', 'CONFIRMED', 'CHECKED_IN']);

/** `2026-10-13` in clinic time, so "today" means the clinic's today. */
const clinicDay = (date: string | number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(date));

/** Still to happen: an active booking today or on a later day (clinic calendar). */
export function isComingUp(a: Pick<Appointment, 'status' | 'scheduledAt'>, now: number): boolean {
  return ACTIVE.has(a.status) && clinicDay(a.scheduledAt) >= clinicDay(now);
}

/** "Video" or "At the clinic", in words and with an icon. */
export function ModeChip({ entrySource }: { entrySource: Appointment['entrySource'] }) {
  return entrySource === 'VIDEO_CONSULTATION' ? (
    <Chip tone="info">
      <VideoCamera size={16} className="mr-1.5" aria-hidden="true" />
      Video
    </Chip>
  ) : (
    <Chip tone="neutral">
      <Buildings size={16} className="mr-1.5" aria-hidden="true" />
      At the clinic
    </Chip>
  );
}

const UPCOMING_STATUS: Partial<Record<AppointmentStatus, { label: string; tone: Tone }>> = {
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  REQUESTED: { label: 'Waiting for the clinic to confirm', tone: 'warning' },
  CHECKED_IN: { label: 'You are checked in', tone: 'info' },
};

const PAST_STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  COMPLETED: { label: 'Visited', tone: 'success' },
  CHECKED_IN: { label: 'Visited', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  NO_SHOW: { label: 'Missed', tone: 'warning' },
  CONFIRMED: { label: 'Booked', tone: 'neutral' },
  REQUESTED: { label: 'Not confirmed', tone: 'neutral' },
};

/** The visit's status in words, read differently before and after the day. */
export function visitStatus(
  status: AppointmentStatus,
  upcoming: boolean,
): { label: string; tone: Tone } {
  return (upcoming && UPCOMING_STATUS[status]) || PAST_STATUS[status];
}
