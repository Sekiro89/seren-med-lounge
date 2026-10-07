'use client';

import Link from 'next/link';
import {
  ArrowsClockwise,
  CalendarCheck,
  CalendarPlus,
  ChatCircleText,
  ClipboardText,
  CreditCard,
  FileText,
  Flask,
  Heartbeat,
  Receipt,
  Star,
  VideoCamera,
  type Icon,
} from '@phosphor-icons/react';
import {
  ButtonLink,
  Card,
  CardsSkeleton,
  DateTile,
  Chip,
  ErrorNote,
  IconBadge,
  LinkCard,
  SectionHeading,
  Skeleton,
  type Tone,
} from '../../../components/ui';
import { doctorName, formatDay, formatMoney, formatTime, relativeDay } from '../../../lib/format';
import type {
  Appointment,
  CarePlan,
  ReviewRequest,
  Invoice,
  LabOrder,
  MessageThread,
  Profile,
  QueueStation,
  QueueToken,
} from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';

const STEP_LABEL: Record<CarePlan['followUps'][number]['type'], string> = {
  REVIEW_APPOINTMENT: 'review visit',
  MEDICATION_REMINDER: 'medicine check',
  RECOVERY_CHECK: 'recovery check-in',
  REPORT_ALERT: 'report check',
  OTHER: 'follow-up',
};

/** The Patient Interface of the SereneMed architecture, one tap each. */
const ACTIONS: Array<{ href: string; label: string; icon: Icon }> = [
  { href: '/appointments/book', label: 'Book a visit', icon: CalendarPlus },
  { href: '/appointments/book', label: 'Video consult', icon: VideoCamera },
  { href: '/bills', label: 'Payments', icon: CreditCard },
  { href: '/records', label: 'Records', icon: ClipboardText },
  { href: '/results', label: 'Reports', icon: FileText },
  { href: '/messages', label: 'Messages', icon: ChatCircleText },
];

function QuickActions() {
  return (
    <nav aria-label="Quick actions">
      <ul className="grid grid-cols-3 gap-3">
        {ACTIONS.map(({ href, label, icon: ActionIcon }) => (
          <li key={label}>
            <Link
              href={href}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-2 py-4 text-center shadow-card transition-transform active:scale-[0.98]"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <ActionIcon size={24} aria-hidden="true" />
              </span>
              <span className="text-[0.88rem] font-semibold leading-tight text-fg">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const DESK: Record<QueueStation, string> = {
  VITALS: 'the nurse for your check-up',
  JUNIOR_DOCTOR: 'the doctor',
  SENIOR_DOCTOR: 'the senior doctor',
  LAB: 'the lab',
  BILLING: 'the billing desk',
  PHARMACY: 'the pharmacy',
};

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', timeZone: 'Asia/Kolkata' }).format(
      new Date(),
    ),
  );
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Home answers, without a tap: where am I in the queue (when at the
 * clinic), when is my next visit, and is anything waiting for me (a bill,
 * new results, a reply). Design system 18.2.
 */
export default function HomePage() {
  const profile = useApi<Profile>('/patients/me');
  const queue = useApi<QueueToken[]>('/patients/me/queue', 20_000);
  const appointments = useApi<Appointment[]>('/patients/me/appointments');
  const invoices = useApi<Invoice[]>('/patients/me/invoices');
  const labs = useApi<LabOrder[]>('/patients/me/lab-orders');
  const threads = useApi<Array<MessageThread & { unreadCount: number }>>(
    '/patients/me/message-threads',
  );
  const carePlans = useApi<CarePlan[]>('/patients/me/care-plans');
  const reviews = useApi<ReviewRequest[]>('/patients/me/review-requests');

  const token = queue.data?.find((t) => t.status !== 'COMPLETED');
  const now = useNow();
  const next = appointments.data
    ?.filter(
      (a) =>
        (a.status === 'CONFIRMED' || a.status === 'REQUESTED') &&
        new Date(a.scheduledAt).getTime() > now,
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];

  const owed = (invoices.data ?? [])
    .filter((i) => i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID')
    .reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0);
  const recentResults = (labs.data ?? [])
    .flatMap((o) => o.items.flatMap((item) => item.results))
    .filter((r) => now - new Date(r.createdAt).getTime() < 45 * 86_400_000).length;
  const unread = (threads.data ?? []).reduce((sum, t) => sum + t.unreadCount, 0);
  const pendingReviews = (reviews.data ?? []).filter(
    (r) => r.status === 'REQUESTED' && new Date(r.expiresAt).getTime() > now,
  ).length;
  // The soonest open step of an active care plan (a review visit, a check-in).
  const nextStep = (carePlans.data ?? [])
    .filter((p) => p.status === 'ACTIVE')
    .flatMap((p) => p.followUps.map((f) => ({ ...f, plan: p.title })))
    .filter((f) => f.status === 'PENDING')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  const attention: Array<{ href: string; icon: Icon; tone: Tone; title: string; text: string }> =
    [];
  if (owed > 0) {
    attention.push({
      href: '/bills',
      icon: Receipt,
      tone: 'warning',
      title: `${formatMoney(owed)} to pay`,
      text: 'You can pay at the clinic desk on your next visit.',
    });
  }
  if (recentResults > 0) {
    attention.push({
      href: '/results',
      icon: Flask,
      tone: 'info',
      title: 'Your test results are ready',
      text: 'Your doctor will go through them with you.',
    });
  }
  if (unread > 0) {
    attention.push({
      href: '/messages',
      icon: ChatCircleText,
      tone: 'primary',
      title: unread === 1 ? 'A reply from the clinic' : `${unread} replies from the clinic`,
      text: 'Tap to read.',
    });
  }
  if (pendingReviews > 0) {
    attention.push({
      href: '/feedback',
      icon: Star,
      tone: 'neutral',
      title: 'How was your visit?',
      text: 'Tell us in a minute. It helps us care for you better.',
    });
  }

  const firstName = profile.data?.firstName;

  return (
    <div className="flex flex-col gap-10">
      <header>
        {firstName ? (
          <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-fg">
            {greeting()}, {firstName}
          </h1>
        ) : (
          <Skeleton className="h-9 w-64" />
        )}
        <p className="mt-2 text-fg-muted">{formatDay(new Date().toISOString())}</p>
      </header>

      {queue.loading ? (
        <Skeleton className="h-52" />
      ) : (
        token && <QueueCard token={token} onRefresh={queue.reload} />
      )}

      <QuickActions />

      <section aria-labelledby="next-visit">
        <SectionHeading>
          <span id="next-visit">Your next visit</span>
        </SectionHeading>
        {appointments.loading ? (
          <Skeleton className="h-36" />
        ) : appointments.error ? (
          <ErrorNote message={appointments.error} onRetry={appointments.reload} />
        ) : next ? (
          <NextVisit appointment={next} />
        ) : (
          <Card className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-4">
              <IconBadge icon={CalendarCheck} tone="neutral" />
              <div>
                <p className="font-bold">Nothing booked</p>
                <p className="text-fg-muted">Pick a doctor and a time that suits you.</p>
              </div>
            </div>
            <ButtonLink
              href="/appointments/book"
              icon={<CalendarPlus size={20} aria-hidden="true" />}
            >
              Book a visit
            </ButtonLink>
          </Card>
        )}
      </section>

      {nextStep && (
        <section aria-labelledby="care-next">
          <SectionHeading>
            <span id="care-next">Your care plan</span>
          </SectionHeading>
          <LinkCard href="/care">
            <div className="flex items-center gap-4">
              <IconBadge icon={Heartbeat} tone="success" />
              <div className="min-w-0">
                <p className="font-bold">{nextStep.plan}</p>
                <p className="text-fg-muted">
                  Next: {STEP_LABEL[nextStep.type]} {relativeDay(nextStep.dueAt)}
                </p>
              </div>
            </div>
          </LinkCard>
        </section>
      )}

      <section aria-labelledby="attention">
        <SectionHeading>
          <span id="attention">For you</span>
        </SectionHeading>
        {invoices.loading || labs.loading || threads.loading || reviews.loading ? (
          <CardsSkeleton count={2} />
        ) : attention.length === 0 ? (
          <Card>
            <p className="font-bold">You are all caught up</p>
            <p className="mt-1 text-fg-muted">New results, replies and bills will show up here.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {attention.map((item) => (
              <li key={item.href}>
                <LinkCard href={item.href}>
                  <div className="flex items-center gap-4">
                    <IconBadge icon={item.icon} tone={item.tone} />
                    <div className="min-w-0">
                      <p className="font-bold">{item.title}</p>
                      <p className="text-fg-muted">{item.text}</p>
                    </div>
                  </div>
                </LinkCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The live token while the patient is at the clinic. Refreshes every 20
 * seconds; the wording says what to do, not the internal status.
 */
function QueueCard({ token, onRefresh }: { token: QueueToken; onRefresh: () => void }) {
  const desk = DESK[token.station];
  const message =
    token.status === 'CALLED'
      ? { title: "It's your turn", text: `Please go to ${desk} now.` }
      : token.status === 'IN_SERVICE'
        ? { title: `With ${desk} now`, text: 'We will guide you to the next step.' }
        : token.status === 'SKIPPED'
          ? {
              title: 'We missed you',
              text: 'You were called while you were away. Please tell the front desk.',
            }
          : token.ahead === 0
            ? { title: "You're next", text: `Waiting for ${desk}.` }
            : {
                title: `${token.ahead} ${token.ahead === 1 ? 'person' : 'people'} ahead of you`,
                text: `Waiting for ${desk}.`,
              };

  return (
    <section
      aria-label="Your place in the queue"
      aria-live="polite"
      className={`rounded-3xl bg-brand-deep p-6 text-brand-deep-fg shadow-lift sm:p-8 ${
        token.status === 'CALLED' ? 'ring-4 ring-primary-subtle' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-semibold text-brand-deep-fg/80">You are at the clinic</p>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh your place in the queue"
          className="-m-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-brand-deep-fg/80 hover:bg-white/10"
        >
          <ArrowsClockwise size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-4 flex items-end gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-deep-fg/70">
            Token
          </p>
          <p className="tabular font-mono text-6xl font-semibold leading-none tracking-tight text-white">
            {String(token.tokenNumber).padStart(3, '0')}
          </p>
        </div>
      </div>
      <div className="mt-6 border-t border-white/15 pt-5">
        <p className="text-xl font-bold text-white">{message.title}</p>
        <p className="mt-1 text-brand-deep-fg">{message.text}</p>
      </div>
    </section>
  );
}

function NextVisit({ appointment }: { appointment: Appointment }) {
  const confirmed = appointment.status === 'CONFIRMED';
  return (
    <Card className="flex gap-5">
      <DateTile iso={appointment.scheduledAt} />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">
          {formatDay(appointment.scheduledAt)}, {formatTime(appointment.scheduledAt)}
        </p>
        <p className="text-fg-muted">
          With {doctorName(appointment.doctor)} · {relativeDay(appointment.scheduledAt)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Chip tone={confirmed ? 'success' : 'warning'}>
            {confirmed ? 'Confirmed' : 'Waiting for the clinic to confirm'}
          </Chip>
          {appointment.entrySource === 'VIDEO_CONSULTATION' && (
            <Chip tone="info">Video consultation</Chip>
          )}
          <Link
            href={`/appointments/${appointment.id}`}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Details
          </Link>
        </div>
      </div>
    </Card>
  );
}
