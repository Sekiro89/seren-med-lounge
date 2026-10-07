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
  SegmentRule,
  Skeleton,
  type Tone,
} from '../../../components/ui';
import {
  clinicDayKey,
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
  // While the patient is at the clinic, today's visit is the live one above, not "next".
  const today = clinicDayKey(new Date(now).toISOString());
  const next = appointments.data
    ?.filter((a) => isComingUp(a, now))
    .filter((a) => !token || (a.status !== 'CHECKED_IN' && clinicDayKey(a.scheduledAt) !== today))
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

  // At the clinic the live token leads and the next visit sits with the rest;
  // otherwise the next visit takes the token's place.
  const nextVisit = (
    <section aria-labelledby="next-visit" className="border-t border-fg">
      <h2 id="next-visit" className="sr-only">
        Your next visit
      </h2>
      {appointments.loading ? (
        <Skeleton className="mt-3 h-16" />
      ) : appointments.error ? (
        <div className="pt-3">
          <ErrorNote message={appointments.error} onRetry={appointments.reload} />
        </div>
      ) : next ? (
        <NextVisit appointment={next} />
      ) : (
        <div className="flex flex-col gap-4 pt-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm text-fg-muted">Next visit</p>
            <p className="font-semibold">Nothing booked</p>
            <p className="text-sm text-fg-muted">Pick a doctor and a time that suits you.</p>
          </div>
          <ButtonLink
            href="/appointments/book"
            variant="secondary"
            icon={<CalendarPlus size={20} aria-hidden="true" />}
          >
            Book a visit
          </ButtonLink>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-x-14 lg:gap-y-0">
      <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:gap-7">
        <header>
          <p className="text-sm text-fg-muted">{formatDay(new Date().toISOString())}</p>
          {firstName ? (
            <h1 className="mt-1 text-[1.6rem] font-semibold leading-tight tracking-[-0.01em] text-fg lg:text-[1.9rem]">
              {greeting()}, {firstName}
            </h1>
          ) : (
            <Skeleton className="mt-1 h-9 w-64" />
          )}
        </header>

        {queue.loading ? (
          <Skeleton className="h-52" />
        ) : (
          token && <LiveVisit token={token} onRefresh={queue.reload} />
        )}
        {!queue.loading && !token && nextVisit}
      </div>

      <div className="flex flex-col gap-5 lg:gap-7">
        <QuickActions
          newResults={labs.loading ? undefined : recentResults}
          owed={invoices.loading ? undefined : owed}
        />

        {token && nextVisit}

        {nextStep && <CarePlanRow plan={nextStep.plan} step={nextStep} />}

        <section aria-labelledby="attention" className="mt-3">
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
            ? { title: 'You are next', text: `Waiting for ${desk}. Please stay nearby.` }
            : {
                title: `${token.ahead} ${token.ahead === 1 ? 'person' : 'people'} ahead of you`,
                text: `Waiting for ${desk}.`,
              };

  return (
    <section
      aria-label="Your visit today"
      aria-live="polite"
      className="flex flex-col border-t border-fg pt-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-fg-muted">Your token today</p>
        <div className="-my-2 -mr-2 flex items-center gap-1">
          <Chip tone="info">Live</Chip>
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
      <p className="tabular mt-1 font-mono text-[5.2rem] font-medium leading-[0.95] tracking-[-0.02em] text-fg lg:text-[6rem]">
        <span className="sr-only">Token </span>
        {String(token.tokenNumber).padStart(3, '0')}
      </p>
      <p
        className={`mt-3 text-[1.18rem] font-semibold leading-snug ${
          token.status === 'CALLED' ? 'text-primary' : 'text-fg'
        }`}
      >
        {message.title}
      </p>
      <p className="text-fg-muted">{message.text}</p>
      <div className="mt-3">
        <VisitProgress token={token} />
      </div>
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
          <span className="font-medium text-primary">
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
          <span className="font-medium text-warning-fg">
            <span className="font-mono">{formatMoney(owed)}</span> due
          </span>
        ) : (
          'at the desk'
        ),
      icon: Receipt,
    },
  ];
  return (
    <nav aria-label="Quick actions">
      <ul className="grid grid-cols-2 border-l border-t border-line">
        {actions.map(({ href, title, sub, icon: ActionIcon }) => (
          <li key={href} className="border-b border-r border-line">
            <Link
              href={href}
              className="grid min-h-[4.4rem] grid-cols-[auto_1fr] items-start gap-x-3 p-3.5 transition-colors hover:bg-surface-muted"
            >
              <ActionIcon size={24} className="row-span-2 mt-0.5 text-fg" aria-hidden="true" />
              <span className="font-semibold leading-snug text-fg">{title}</span>
              <span className="text-[0.88rem] text-fg-muted">{sub}</span>
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
      className="group flex items-center gap-5 py-3 transition-colors hover:bg-surface-muted"
    >
      <p className="w-14 shrink-0 text-center">
        <span className="tabular block font-mono text-[2.35rem] leading-none">
          {formatDayNumber(iso)}
        </span>
        <span className="block text-sm text-fg-muted">{formatMonthShort(iso)}</span>
      </p>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg-muted">Next visit · {relativeDay(iso)}</p>
        <p className="font-semibold">
          {formatWeekdayShort(iso)}, <span className="tabular font-mono">{formatTime(iso)}</span>
        </p>
        <p className="text-fg-muted">
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
  return (
    <section aria-labelledby="care-next" className="border-t border-fg">
      <Link
        href="/care"
        className="flex flex-col gap-2 py-3 transition-colors hover:bg-surface-muted"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="care-next" className="font-semibold">
            {plan.title}
          </h2>
          {steps.length > 0 && (
            <p className="shrink-0 text-success-fg">
              <span className="font-mono">{done}</span> of{' '}
              <span className="font-mono">{steps.length}</span> done
            </p>
          )}
        </div>
        <SegmentRule total={steps.length} done={done} />
        <p className="text-fg-muted">
          Next: {STEP_LABEL[step.type]} {relativeDay(step.dueAt)}
        </p>
      </Link>
    </section>
  );
}
