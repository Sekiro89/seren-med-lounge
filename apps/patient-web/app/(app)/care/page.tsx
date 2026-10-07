'use client';

import { CalendarPlus, ClipboardText } from '@phosphor-icons/react';
import {
  BackLink,
  ButtonLink,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  Note,
  PageTitle,
  Rows,
  SectionHeading,
  SegmentRule,
} from '../../../components/ui';
import { formatDate, formatDayNumber, formatMonthShort, relativeDay } from '../../../lib/format';
import type { CarePlan } from '../../../lib/types';
import { useApi } from '../../../lib/use-api';

type FollowUp = CarePlan['followUps'][number];

const FOLLOW_UP: Record<FollowUp['type'], string> = {
  REVIEW_APPOINTMENT: 'Review visit',
  MEDICATION_REMINDER: 'Medicine check',
  RECOVERY_CHECK: 'Recovery check-in from the clinic',
  REPORT_ALERT: 'Report check',
  OTHER: 'Follow-up',
};

const FOLLOW_UP_STATUS: Record<string, string> = {
  MISSED: 'Missed',
  ESCALATED: 'The clinic will contact you',
  CANCELLED: 'No longer needed',
};

/** `5 Sep` */
const shortDate = (iso: string) => `${formatDayNumber(iso)} ${formatMonthShort(iso)}`;

/**
 * What the doctor asked the patient to do after a visit, and what comes
 * next. Current plans first; finished plans under "Earlier plans".
 */
export default function CarePage() {
  const plans = useApi<CarePlan[]>('/patients/me/care-plans');
  const sorted = [...(plans.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const current = sorted.filter((p) => p.status === 'ACTIVE');
  const earlier = sorted.filter((p) => p.status !== 'ACTIVE');

  return (
    <div>
      <BackLink href="/records">Records</BackLink>
      <PageTitle
        title="Care plan"
        description="What your doctor asked you to do, and what's next."
      />

      {plans.loading ? (
        <CardsSkeleton count={2} />
      ) : plans.error ? (
        <ErrorNote message={plans.error} onRetry={plans.reload} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={ClipboardText}
          title="No care plan"
          description="If your doctor gives you a plan after a visit, it will show up here."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {current.length > 0 && (
            <ul className="flex flex-col gap-10">
              {current.map((plan) => (
                <li key={plan.id}>
                  <PlanCard plan={plan} />
                </li>
              ))}
            </ul>
          )}
          {earlier.length > 0 && (
            <section aria-labelledby="earlier-plans">
              <SectionHeading>
                <span id="earlier-plans">Earlier plans</span>
              </SectionHeading>
              <Rows>
                {earlier.map((plan) => (
                  <li key={plan.id} className="py-4">
                    <PlanCard plan={plan} compact />
                  </li>
                ))}
              </Rows>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, compact = false }: { plan: CarePlan; compact?: boolean }) {
  const done = plan.status === 'COMPLETED';
  const stopped = plan.status === 'CANCELLED';
  const followUps = [...plan.followUps].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const counted = followUps.filter((f) => f.status !== 'CANCELLED');
  const doneCount = counted.filter((f) => f.status === 'DONE').length;

  return (
    <article className={compact ? '' : 'border-t border-fg pt-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={compact ? 'font-medium' : 'text-[1.18rem] font-semibold'}>{plan.title}</h2>
          <p className="text-sm text-fg-muted">From your visit on {shortDate(plan.createdAt)}</p>
        </div>
        {!compact && counted.length > 0 && (
          <p className="text-success-fg">
            <span className="font-mono">{doneCount}</span> of{' '}
            <span className="font-mono">{counted.length}</span> done
          </p>
        )}
        {done && <Chip tone="success">Finished</Chip>}
        {stopped && <Chip>Stopped by the clinic</Chip>}
      </div>

      {!compact && counted.length > 0 && (
        <div className="mt-3">
          <SegmentRule total={counted.length} done={doneCount} />
        </div>
      )}

      {plan.dischargeInstructions && (
        <Note className="mt-5" title="What your doctor asked">
          <p className="whitespace-pre-line">{plan.dischargeInstructions}</p>
        </Note>
      )}

      {followUps.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-fg-muted">Next steps</h3>
          <Rows className="mt-1">
            {followUps.map((f) => (
              <li key={f.id} className="py-3">
                <FollowUpRow followUp={f} />
              </li>
            ))}
          </Rows>
        </div>
      )}
    </article>
  );
}

function FollowUpRow({ followUp }: { followUp: FollowUp }) {
  const pending = followUp.status === 'PENDING';
  const done = followUp.status === 'DONE';
  const other = FOLLOW_UP_STATUS[followUp.status];
  const canBook = pending && followUp.type === 'REVIEW_APPOINTMENT' && !followUp.appointmentId;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-medium">{FOLLOW_UP[followUp.type] ?? 'Follow-up'}</p>
        {done && <Chip tone="success">Done</Chip>}
        {pending && followUp.appointmentId && <Chip tone="primary">Booked</Chip>}
        {other && <Chip tone={followUp.status === 'ESCALATED' ? 'info' : 'neutral'}>{other}</Chip>}
      </div>
      <p className="text-sm text-fg-muted">
        Around {formatDate(followUp.dueAt)}
        {pending && ` · ${relativeDay(followUp.dueAt)}`}
      </p>
      {followUp.notes && <p className="mt-1 whitespace-pre-line">{followUp.notes}</p>}
      {canBook && (
        <div className="mt-3">
          <ButtonLink
            href="/appointments/book"
            variant="secondary"
            icon={<CalendarPlus size={20} aria-hidden="true" />}
          >
            Book your review
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
