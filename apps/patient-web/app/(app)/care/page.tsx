'use client';

import { CalendarPlus, CheckCircle, ClipboardText, Info } from '@phosphor-icons/react';
import {
  ButtonLink,
  Card,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  PageTitle,
  SectionHeading,
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
            <ul className="flex flex-col gap-4">
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
              <ul className="flex flex-col gap-4">
                {earlier.map((plan) => (
                  <li key={plan.id}>
                    <PlanCard plan={plan} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: CarePlan }) {
  const done = plan.status === 'COMPLETED';
  const stopped = plan.status === 'CANCELLED';
  const followUps = [...plan.followUps].sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{plan.title}</h2>
          <p className="text-fg-muted">From your visit on {shortDate(plan.createdAt)}</p>
        </div>
        {done && <Chip tone="success">Finished</Chip>}
        {stopped && <Chip>Stopped by the clinic</Chip>}
      </div>

      {plan.dischargeInstructions && (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-primary-subtle px-4 py-4 text-primary-subtle-fg">
          <Info size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="whitespace-pre-line">{plan.dischargeInstructions}</p>
        </div>
      )}

      {followUps.length > 0 && (
        <div className="mt-5 border-t border-line pt-5">
          <h3 className="font-bold">Next steps</h3>
          <ul className="mt-3 flex flex-col gap-4">
            {followUps.map((f) => (
              <li key={f.id}>
                <FollowUpRow followUp={f} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
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
        <p className="font-semibold">{FOLLOW_UP[followUp.type] ?? 'Follow-up'}</p>
        {done && (
          <Chip tone="success">
            <CheckCircle size={16} weight="fill" className="mr-1" aria-hidden="true" />
            Done
          </Chip>
        )}
        {pending && followUp.appointmentId && <Chip tone="primary">Booked</Chip>}
        {other && <Chip tone={followUp.status === 'ESCALATED' ? 'info' : 'neutral'}>{other}</Chip>}
      </div>
      <p className="text-fg-muted">
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
