'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowsClockwise,
  CalendarPlus,
  CaretRight,
  ChatCircleText,
  Flask,
  Receipt,
  Star,
  VideoCamera,
  type Icon,
} from '@phosphor-icons/react';
import {
  ButtonLink,
  CardsSkeleton,
  Chip,
  ErrorNote,
  IconBadge,
  LinkCard,
  Rows,
  SectionHeading,
  Skeleton,
  type Tone,
} from '../../../components/ui';
import {
  doctorName,
  formatDay,
  formatDayNumber,
  formatMoney,
  formatMonthShort,
  formatTime,
  formatWeekdayShort,
  relativeDay,
} from '../../../lib/format';
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
import { isComingUp, visitStatus } from '../appointments/shared';
import { VisitProgress } from './visit-progress';

const STEP_LABEL: Record<CarePlan['followUps'][number]['type'], string> = {
  REVIEW_APPOINTMENT: 'review visit',
  MEDICATION_REMINDER: 'medicine check',
  RECOVERY_CHECK: 'recovery check-in',
  REPORT_ALERT: 'report check',
  OTHER: 'follow-up',
};

const DESK: Record<QueueStation, string> = {
  VITALS: 'the nurse for your check-up',
  JUNIOR_DOCTOR: 'the doctor',
  SENIOR_DOCTOR: 'the senior doctor',
  LAB: 'the lab',
  BILLING: 'the billing desk',
  PHARMACY: 'the pharmacy',
};

/** What comes after each desk, in words. */
const AFTER: Record<QueueStation, string | null> = {
  VITALS: 'Next: the doctor.',
  JUNIOR_DOCTOR: 'Your doctor will tell you what comes next.',
  SENIOR_DOCTOR: 'Your doctor will tell you what comes next.',
  LAB: 'Next: billing.',
  BILLING: null,
  PHARMACY: null,
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
 * Home answers, without a tap: where am I in my visit (when at the
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

  // The newest unfinished token: a patient seen twice in a day must see today's latest visit,
  // not an earlier token that was never closed.
  const token = [...(queue.data ?? [])]
    .sort((a, b) => b.tokenNumber - a.tokenNumber)
    .find((t) => t.status !== 'COMPLETED');
  const now = useNow();
  // Same rule as the Appointments page, so Home and the list never disagree.
  const next = appointments.data
    ?.filter((a) => isComingUp(a, now))
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
  // The plan with the soonest open step (a review visit, a check-in).
  const activePlans = (carePlans.data ?? []).filter((p) => p.status === 'ACTIVE');
  const nextStep = activePlans
    .flatMap((p) => p.followUps.map((f) => ({ ...f, plan: p })))
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
      tone: 'neutral',
      title: 'Your test results are ready',
      text: 'Your doctor will go through them with you.',
    });
  }
  if (unread > 0) {
    attention.push({
      href: '/messages',
      icon: ChatCircleText,
      tone: 'neutral',
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
    <div className="flex flex-col">
      <header className="-mx-5 border-b border-line px-5 pb-5 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <p className="text-sm text-fg-muted">{formatDay(new Date().toISOString())}</p>
        {firstName ? (
          <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.01em] text-fg">
            {greeting()}, {firstName}
          </h1>
        ) : (
          <Skeleton className="mt-1 h-9 w-64" />
        )}
      </header>

      {queue.loading ? (
        <Skeleton className="mt-6 h-52" />
      ) : (
        token && <LiveVisit token={token} onRefresh={queue.reload} />
      )}

      <QuickActions
        newResults={labs.loading ? undefined : recentResults}
        owed={invoices.loading ? undefined : owed}
      />

      <section aria-labelledby="next-visit" className="-mx-5 sm:-mx-6 lg:-mx-10">
        <h2 id="next-visit" className="sr-only">
          Your next visit
        </h2>
        {appointments.loading ? (
          <div className="px-5 py-4 sm:px-6 lg:px-10">
            <Skeleton className="h-16" />
          </div>
        ) : appointments.error ? (
          <div className="px-5 py-4 sm:px-6 lg:px-10">
            <ErrorNote message={appointments.error} onRetry={appointments.reload} />
          </div>
        ) : next ? (
          <NextVisit appointment={next} />
        ) : (
          <div className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:px-6 lg:px-10">
            <div className="flex-1">
              <p className="text-sm text-fg-muted">Next visit</p>
              <p className="font-semibold">Nothing booked</p>
              <p className="text-sm text-fg-muted">Pick a doctor and a time that suits you.</p>
            </div>
            <ButtonLink
              href="/appointments/book"
              icon={<CalendarPlus size={20} aria-hidden="true" />}
            >
              Book a visit
            </ButtonLink>
          </div>
        )}
      </section>

      {nextStep && <CarePlanRow plan={nextStep.plan} step={nextStep} />}

      <section aria-labelledby="attention" className="mt-10">
        <SectionHeading>
          <span id="attention">For you</span>
        </SectionHeading>
        {invoices.loading || labs.loading || threads.loading || reviews.loading ? (
          <CardsSkeleton count={2} />
        ) : attention.length === 0 ? (
          <div className="border-b border-line py-4">
            <p className="font-medium">You are all caught up</p>
            <p className="text-fg-muted">New results, replies and bills will show up here.</p>
          </div>
        ) : (
          <Rows>
            {attention.map((item) => (
              <li key={item.href}>
                <LinkCard href={item.href}>
                  <div className="flex items-center gap-4">
                    <IconBadge icon={item.icon} tone={item.tone} />
                    <div className="min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-fg-muted">{item.text}</p>
                    </div>
                  </div>
                </LinkCard>
              </li>
            ))}
          </Rows>
        )}
      </section>
    </div>
  );
}

/**
 * The live visit while the patient is at the clinic: the token set very
 * large, what is happening in words, and the visit-progress ruler.
 * Refreshes every 20 seconds.
 */
function LiveVisit({ token, onRefresh }: { token: QueueToken; onRefresh: () => void }) {
  const desk = DESK[token.station];
  const message =
    token.status === 'CALLED'
      ? { title: "It's your turn", text: `Please go to ${desk} now.` }
      : token.status === 'IN_SERVICE'
        ? {
            title: `With ${desk} now`,
            text: AFTER[token.station] ?? 'We will guide you to the next step.',
          }
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
    <section aria-label="Your visit today" aria-live="polite" className="pb-6 pt-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-fg-muted">Your token today</p>
        <div className="-mr-2 -mt-2 flex items-center gap-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <span aria-hidden="true" className="size-2 bg-primary" />
            Live
          </span>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh your place in the queue"
            className="flex size-11 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg"
          >
            <ArrowsClockwise size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="tabular -mt-1 font-mono text-[5.4rem] font-medium leading-[0.95] tracking-[-0.04em] text-fg">
        <span className="sr-only">Token </span>
        {String(token.tokenNumber).padStart(3, '0')}
      </p>
      <p
        className={`mt-3 text-[1.12rem] font-semibold ${
          token.status === 'CALLED' ? 'text-primary' : 'text-fg'
        }`}
      >
        {message.title}
      </p>
      <p className="text-fg-muted">{message.text}</p>
      <VisitProgress token={token} />
    </section>
  );
}

/** The things a patient opens the app for, as a ruled 2×2 grid. */
function QuickActions({ newResults, owed }: { newResults?: number; owed?: number }) {
  const actions: Array<{ href: string; title: string; sub: ReactNode; icon: Icon }> = [
    { href: '/appointments/book', title: 'Book', sub: 'a visit', icon: CalendarPlus },
    {
      href: '/appointments/book?mode=video&step=2',
      title: 'Video',
      sub: 'call a doctor',
      icon: VideoCamera,
    },
    {
      href: '/results',
      title: 'Results',
      sub:
        newResults && newResults > 0 ? (
          <span className="font-semibold text-primary">
            <span className="font-mono">{newResults}</span> new
          </span>
        ) : (
          'your tests'
        ),
      icon: Flask,
    },
    {
      href: '/bills',
      title: 'Pay',
      sub:
        owed && owed > 0 ? (
          <span className="font-semibold text-warning-fg">
            <span className="font-mono">{formatMoney(owed)}</span> due
          </span>
        ) : (
          'at the desk'
        ),
      icon: Receipt,
    },
  ];
  return (
    <nav aria-label="Quick actions" className="-mx-5 sm:-mx-6 lg:-mx-10">
      <ul className="grid grid-cols-2 border-y border-line">
        {actions.map(({ href, title, sub, icon: ActionIcon }, i) => (
          <li
            key={href}
            className={`${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''} border-line`}
          >
            <Link
              href={href}
              className={`flex min-h-[4.6rem] items-center gap-3 py-3.5 transition-colors hover:bg-surface-muted ${
                i % 2 === 0 ? 'pl-5 pr-3 sm:pl-6 lg:pl-10' : 'pl-5 pr-5 sm:pr-6 lg:pr-10'
              }`}
            >
              <ActionIcon size={26} className="shrink-0 text-fg" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-medium leading-snug text-fg">{title}</span>
                <span className="block text-sm text-fg-muted">{sub}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NextVisit({ appointment }: { appointment: Appointment }) {
  const status = visitStatus(appointment.status, true);
  const iso = appointment.scheduledAt;
  const video = appointment.entrySource === 'VIDEO_CONSULTATION';
  return (
    <Link
      href={`/appointments/${appointment.id}`}
      className="group flex items-center gap-4 border-b border-line px-5 py-4 transition-colors hover:bg-surface-muted sm:px-6 lg:px-10"
    >
      <div className="w-12 shrink-0 text-center">
        <p className="tabular font-mono text-[2.1rem] leading-none">{formatDayNumber(iso)}</p>
        <p className="text-sm text-fg-muted">{formatMonthShort(iso)}</p>
      </div>
      <div className="min-w-0 flex-1 border-l border-line pl-4">
        <p className="text-sm text-fg-muted">Next visit · {relativeDay(iso)}</p>
        <p className="font-semibold">
          {formatWeekdayShort(iso)}, <span className="tabular font-mono">{formatTime(iso)}</span>
        </p>
        <p className="text-sm text-fg-muted">
          {video ? 'Video call' : 'At the clinic'} with {doctorName(appointment.doctor)}
        </p>
        {appointment.status !== 'CONFIRMED' && (
          <div className="mt-1.5">
            <Chip tone={status.tone}>{status.label}</Chip>
          </div>
        )}
      </div>
      <CaretRight
        size={20}
        className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

/** The active care plan: how many steps are done, as a segmented rule, and the next one. */
function CarePlanRow({ plan, step }: { plan: CarePlan; step: CarePlan['followUps'][number] }) {
  const steps = plan.followUps.filter((f) => f.status !== 'CANCELLED');
  const done = steps.filter((f) => f.status === 'DONE').length;
  // Up to 8 segments; a longer plan shows as one proportional rule.
  const segmented = steps.length > 0 && steps.length <= 8;
  return (
    <section aria-labelledby="care-next" className="-mx-5 sm:-mx-6 lg:-mx-10">
      <Link
        href="/care"
        className="block border-b border-line px-5 py-4 transition-colors hover:bg-surface-muted sm:px-6 lg:px-10"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="care-next" className="font-semibold">
            {plan.title}
          </h2>
          {steps.length > 0 && (
            <p className="shrink-0 text-sm font-semibold text-success-fg">
              <span className="font-mono">{done}</span> of{' '}
              <span className="font-mono">{steps.length}</span> done
            </p>
          )}
        </div>
        {steps.length > 0 && (
          <div
            aria-hidden="true"
            className={`mt-2 ${segmented ? 'grid gap-1' : 'flex bg-line'}`}
            style={segmented ? { gridTemplateColumns: `repeat(${steps.length}, 1fr)` } : undefined}
          >
            {segmented ? (
              steps.map((f, i) => (
                <span key={f.id} className={`h-1 ${i < done ? 'bg-success-fg' : 'bg-line'}`} />
              ))
            ) : (
              <span
                className="h-1 bg-success-fg"
                style={{ width: `${(done / steps.length) * 100}%` }}
              />
            )}
          </div>
        )}
        <p className="mt-1.5 text-sm text-fg-muted">
          Next: {STEP_LABEL[step.type]} {relativeDay(step.dueAt)}
        </p>
      </Link>
    </section>
  );
}
