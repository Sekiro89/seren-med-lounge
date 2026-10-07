'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  ChatCircleText,
  Envelope,
  Star,
  Heartbeat,
  Phone,
  Receipt,
  ShieldCheck,
  SignOut,
  Warning,
} from '@phosphor-icons/react';
import {
  Button,
  Card,
  CardsSkeleton,
  Chip,
  ErrorNote,
  IconBadge,
  LinkCard,
  PageTitle,
  SectionHeading,
  Skeleton,
} from '../../../components/ui';
import { apiClient } from '../../../lib/api-client';
import { clearPatientToken } from '../../../lib/auth';
import { ageFrom, formatDate } from '../../../lib/format';
import type {
  HistoryEntry,
  InsurancePolicy,
  MessageThread,
  Profile,
  ReviewRequest,
} from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';

const SEVERITY: Record<NonNullable<HistoryEntry['severity']>, string> = {
  MILD: 'Mild reaction',
  MODERATE: 'Moderate reaction',
  SEVERE: 'Severe reaction',
};

const HEALTH_GROUPS: Array<{ category: HistoryEntry['category']; title: string }> = [
  { category: 'CONDITION', title: 'Conditions' },
  { category: 'PAST_SURGERY', title: 'Past operations' },
  { category: 'FAMILY_HISTORY', title: 'In your family' },
];

/**
 * Who this record belongs to (name and date of birth, so a family member
 * using the phone can confirm it), allergies first, then conditions and
 * insurance, links to payments, feedback, notifications and messages, and
 * sign out. Design system 18.3.
 */
export default function MePage() {
  const router = useRouter();
  const profile = useApi<Profile>('/patients/me');
  const history = useApi<HistoryEntry[]>('/patients/me/medical-history');
  const threads = useApi<Array<MessageThread & { unreadCount: number }>>(
    '/patients/me/message-threads',
  );
  const reviewRequests = useApi<ReviewRequest[]>('/patients/me/review-requests');
  const policies = useApi<InsurancePolicy[]>('/patients/me/insurance-policies');
  const now = useNow();
  const [signingOut, setSigningOut] = useState(false);

  const allergies = (history.data ?? []).filter((h) => h.category === 'ALLERGY');
  const unread = (threads.data ?? []).reduce((sum, t) => sum + t.unreadCount, 0);
  const toReview = (reviewRequests.data ?? []).filter(
    (r) => r.status === 'REQUESTED' && new Date(r.expiresAt).getTime() > now,
  ).length;

  async function signOut() {
    setSigningOut(true);
    try {
      await apiClient.post('/auth/patient/logout');
    } catch {
      // The token is cleared below either way.
    }
    clearPatientToken();
    router.replace('/login');
  }

  return (
    <div>
      <PageTitle title="Me" description="Your details and health record at the clinic." />

      <div className="flex flex-col gap-10">
        {profile.loading ? (
          <Skeleton className="h-44" />
        ) : profile.error ? (
          <ErrorNote message={profile.error} onRetry={profile.reload} />
        ) : (
          profile.data && <IdentityCard profile={profile.data} />
        )}

        <section aria-labelledby="allergies">
          <SectionHeading>
            <span id="allergies">Allergies</span>
          </SectionHeading>
          {history.loading ? (
            <CardsSkeleton count={1} />
          ) : history.error ? (
            <ErrorNote message={history.error} onRetry={history.reload} />
          ) : allergies.length === 0 ? (
            <Card className="flex items-center gap-4">
              <IconBadge icon={Warning} tone="neutral" />
              <p className="text-fg-muted">
                No allergies recorded. Tell the clinic if this is wrong.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {allergies.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-4 rounded-2xl border border-line bg-warning-bg p-5 text-warning-fg sm:p-6"
                >
                  <Warning size={28} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-bold">
                      <span className="sr-only">Allergy: </span>
                      {a.description}
                    </p>
                    {a.severity && <p>{SEVERITY[a.severity]}</p>}
                    {a.status === 'RESOLVED' && <p>No longer a problem</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="conditions">
          <SectionHeading>
            <span id="conditions">Health conditions</span>
          </SectionHeading>
          {history.loading ? (
            <CardsSkeleton count={1} />
          ) : history.error ? null : (
            <HealthConditions entries={history.data ?? []} />
          )}
        </section>

        <section aria-labelledby="insurance">
          <SectionHeading>
            <span id="insurance">Insurance</span>
          </SectionHeading>
          {policies.loading ? (
            <CardsSkeleton count={1} />
          ) : policies.error ? (
            <ErrorNote message={policies.error} onRetry={policies.reload} />
          ) : (
            <InsuranceCard policies={policies.data ?? []} />
          )}
        </section>

        <section aria-labelledby="more">
          <SectionHeading>
            <span id="more">More</span>
          </SectionHeading>
          <ul className="flex flex-col gap-3">
            <li>
              <LinkCard href="/bills">
                <div className="flex items-center gap-4">
                  <IconBadge icon={Receipt} tone="primary" />
                  <p className="font-bold">Payments</p>
                </div>
              </LinkCard>
            </li>
            <li>
              <LinkCard href="/feedback">
                <div className="flex flex-wrap items-center gap-4">
                  <IconBadge icon={Star} tone="primary" />
                  <p className="font-bold">Feedback</p>
                  {toReview > 0 && <Chip tone="primary">{toReview} to do</Chip>}
                </div>
              </LinkCard>
            </li>
            <li>
              <LinkCard href="/notifications">
                <div className="flex items-center gap-4">
                  <IconBadge icon={Bell} tone="primary" />
                  <p className="font-bold">Notifications</p>
                </div>
              </LinkCard>
            </li>
            <li>
              <LinkCard href="/messages">
                <div className="flex flex-wrap items-center gap-4">
                  <IconBadge icon={ChatCircleText} tone="primary" />
                  <p className="font-bold">Messages</p>
                  {unread > 0 && <Chip tone="primary">{unread} new</Chip>}
                </div>
              </LinkCard>
            </li>
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          <p className="text-fg-muted">
            To correct any of these details, tell the front desk on your next visit.
          </p>
          <Button
            variant="secondary"
            full
            loading={signingOut}
            onClick={signOut}
            icon={<SignOut size={20} aria-hidden="true" />}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function IdentityCard({ profile }: { profile: Profile }) {
  const initials = `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
  return (
    <Card>
      <div className="flex items-center gap-4">
        <span
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xl font-bold text-primary-subtle-fg"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-xl font-bold">
            {profile.firstName} {profile.lastName}
          </p>
          <p className="text-fg-muted">
            Born {formatDate(profile.dateOfBirth)} · {ageFrom(profile.dateOfBirth)} years
          </p>
        </div>
      </div>
      <dl className="mt-5 flex flex-col gap-3 border-t border-line pt-5">
        <div className="flex items-center gap-3">
          <dt>
            <Phone size={20} className="text-fg-subtle" aria-hidden="true" />
            <span className="sr-only">Phone</span>
          </dt>
          <dd className="break-all">{profile.phone}</dd>
        </div>
        <div className="flex items-center gap-3">
          <dt>
            <Envelope size={20} className="text-fg-subtle" aria-hidden="true" />
            <span className="sr-only">Email</span>
          </dt>
          <dd className="break-all">
            {profile.email ?? <span className="text-fg-muted">No email on file</span>}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/** "•••• 8812": only the last four characters of a policy number are shown. */
const maskPolicy = (number: string) => {
  const tail = number.replace(/\s/g, '').slice(-4);
  return `•••• ${tail}`;
};

function InsuranceCard({ policies }: { policies: InsurancePolicy[] }) {
  if (policies.length === 0) {
    return (
      <Card className="flex items-center gap-4">
        <IconBadge icon={ShieldCheck} tone="neutral" />
        <p className="text-fg-muted">
          No insurance on file. Tell the front desk if you have a policy.
        </p>
      </Card>
    );
  }
  return (
    <Card as="div" className="p-0 sm:p-0">
      <ul className="divide-y divide-line">
        {policies.map((p) => (
          <li key={p.id} className="flex items-start gap-4 px-5 py-5 sm:px-6">
            <IconBadge icon={ShieldCheck} tone={p.isActive ? 'primary' : 'neutral'} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-bold">{p.insurerName}</p>
                {!p.isActive && <Chip>No longer active</Chip>}
              </div>
              <p className="text-fg-muted">
                Policy number <span className="tabular">{maskPolicy(p.policyNumber)}</span>
              </p>
              <p className="text-fg-muted">
                {p.validTo ? `Valid until ${formatDate(p.validTo)}` : 'No end date on file'}
              </p>
              {p.tpaName && <p className="text-sm text-fg-subtle">Handled through {p.tpaName}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HealthConditions({ entries }: { entries: HistoryEntry[] }) {
  const groups = HEALTH_GROUPS.map((g) => ({
    ...g,
    items: entries.filter((e) => e.category === g.category),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <Card className="flex items-center gap-4">
        <IconBadge icon={Heartbeat} tone="neutral" />
        <p className="text-fg-muted">
          Nothing recorded yet. Tell the clinic if something is missing.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.category}>
            <h3 className="font-bold text-fg-muted">{g.title}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {g.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{item.description}</span>
                  {item.status === 'RESOLVED' && <Chip>Resolved</Chip>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
