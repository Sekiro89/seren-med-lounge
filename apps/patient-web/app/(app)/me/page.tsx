'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  ChatCircleText,
  Star,
  Receipt,
  ShieldCheck,
  SignOut,
  Warning,
} from '@phosphor-icons/react';
import {
  Button,
  CardsSkeleton,
  Chip,
  ErrorNote,
  IconBadge,
  KeyValues,
  LinkCard,
  PageTitle,
  Rows,
  SectionHeading,
  Skeleton,
  StatusWord,
} from '../../../components/ui';
import { apiClient } from '../../../lib/api-client';
import { clearPatientToken } from '../../../lib/auth';
import { ageFrom, formatDate, formatPhone } from '../../../lib/format';
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

      <div className="flex flex-col gap-8">
        {profile.loading ? (
          <Skeleton className="h-32" />
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
            <p className="border-b border-line py-4 text-fg-muted">
              No allergies recorded. Tell the clinic if this is wrong.
            </p>
          ) : (
            <Rows>
              {allergies.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <Warning
                    size={22}
                    className={`mt-0.5 shrink-0 ${a.status === 'RESOLVED' ? 'text-fg-subtle' : 'text-danger-fg'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-semibold ${a.status === 'RESOLVED' ? 'text-fg' : 'text-danger-fg'}`}
                    >
                      <span className="sr-only">Allergy: </span>
                      {a.description}
                    </p>
                    {a.severity && <p className="text-sm text-fg-muted">{SEVERITY[a.severity]}</p>}
                  </div>
                  {a.status === 'RESOLVED' && <StatusWord>Resolved</StatusWord>}
                </li>
              ))}
            </Rows>
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
          <Rows>
            <li>
              <LinkCard href="/bills">
                <div className="flex items-center gap-4">
                  <IconBadge icon={Receipt} />
                  <p className="font-medium">Payments</p>
                </div>
              </LinkCard>
            </li>
            <li>
              <LinkCard href="/feedback">
                <div className="flex flex-wrap items-center gap-4">
                  <IconBadge icon={Star} />
                  <p className="font-medium">Feedback</p>
                  {toReview > 0 && <Chip tone="primary">{toReview} to do</Chip>}
                </div>
              </LinkCard>
            </li>
            <li>
              <LinkCard href="/notifications">
                <div className="flex items-center gap-4">
                  <IconBadge icon={Bell} />
                  <p className="font-medium">Notifications</p>
                </div>
              </LinkCard>
            </li>
            <li>
              <LinkCard href="/messages">
                <div className="flex flex-wrap items-center gap-4">
                  <IconBadge icon={ChatCircleText} />
                  <p className="font-medium">Messages</p>
                  {unread > 0 && <Chip tone="primary">{unread} new</Chip>}
                </div>
              </LinkCard>
            </li>
          </Rows>
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

/** Whose record this is, as the prototype's key and value list. */
function IdentityCard({ profile }: { profile: Profile }) {
  return (
    <section aria-label="Whose record this is">
      <KeyValues
        className="border-t-fg"
        rows={[
          [
            'Name',
            <span key="n" className="font-medium">
              {profile.firstName} {profile.lastName}
            </span>,
          ],
          ['Born', `${formatDate(profile.dateOfBirth)} · ${ageFrom(profile.dateOfBirth)} years`],
          ...(profile.mrn
            ? ([
                [
                  'Patient number',
                  <span key="m" className="tabular font-mono">
                    {profile.mrn}
                  </span>,
                ],
              ] as Array<[string, ReactNode]>)
            : []),
          [
            'Phone',
            <span key="p" className="tabular font-mono">
              {formatPhone(profile.phone)}
            </span>,
          ],
          [
            'Email',
            profile.email ? (
              <span key="e" className="break-all">
                {profile.email}
              </span>
            ) : (
              <span key="e" className="text-fg-muted">
                None on file
              </span>
            ),
          ],
        ]}
      />
    </section>
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
      <p className="border-b border-line py-4 text-fg-muted">
        No insurance on file. Tell the front desk if you have a policy.
      </p>
    );
  }
  return (
    <Rows>
      {policies.map((p) => (
        <li key={p.id} className="flex items-start gap-4 py-4">
          <IconBadge icon={ShieldCheck} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-medium">{p.insurerName}</p>
              {!p.isActive && <Chip>No longer active</Chip>}
            </div>
            <p className="text-sm text-fg-muted">
              Policy number <span className="tabular font-mono">{maskPolicy(p.policyNumber)}</span>
            </p>
            <p className="text-sm text-fg-muted">
              {p.validTo ? `Valid until ${formatDate(p.validTo)}` : 'No end date on file'}
            </p>
            {p.tpaName && <p className="text-sm text-fg-subtle">Handled through {p.tpaName}</p>}
          </div>
        </li>
      ))}
    </Rows>
  );
}

function HealthConditions({ entries }: { entries: HistoryEntry[] }) {
  const groups = HEALTH_GROUPS.map((g) => ({
    ...g,
    items: entries.filter((e) => e.category === g.category),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="border-b border-line py-4 text-fg-muted">
        Nothing recorded yet. Tell the clinic if something is missing.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 pt-1">
      {groups.map((g) => (
        <div key={g.category}>
          <h3 className="text-sm font-semibold text-fg-muted">{g.title}</h3>
          <ul className="mt-1 divide-y divide-line border-b border-line">
            {g.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span>{item.description}</span>
                {item.status === 'RESOLVED' && <Chip>Resolved</Chip>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
