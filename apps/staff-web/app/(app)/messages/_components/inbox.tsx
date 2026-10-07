'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatsCircle, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { PersonCell } from '../../../../components/ui/avatar';
import { EmptyState } from '../../../../components/ui/empty-state';
import { NoAccess } from '../../../../components/ui/no-access';
import { PageHeader } from '../../../../components/ui/page-header';
import { Skeleton } from '../../../../components/ui/skeleton';
import { Tabs } from '../../../../components/ui/tabs';
import { formatDate, formatTime, fullName } from '../../../../lib/format';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { Conversation } from './conversation';
import { FILTER_QUERY, parseFilter, type FilterKey, type ThreadRow } from './helpers';

const EMPTY: Record<FilterKey, { title: string; description: string }> = {
  open: {
    title: 'No open conversations',
    description: 'When a patient writes to the clinic, the conversation appears here.',
  },
  mine: {
    title: 'Nothing is assigned to you',
    description: 'Open the Open tab and assign a conversation to yourself to see it here.',
  },
  closed: {
    title: 'No closed conversations',
    description: 'Conversations you close are kept here and can be reopened.',
  },
};

function lastSeen(iso: string): string {
  const sameDay = formatDate(iso) === formatDate(new Date().toISOString());
  return sameDay ? formatTime(iso) : formatDate(iso);
}

function InboxInner({ selectedId }: { selectedId?: string }) {
  const user = useStaff();
  const allowed = can(user.role, 'message:manage');
  const router = useRouter();
  const params = useSearchParams();
  const filter = parseFilter(params.get('filter'));
  const suffix = filter === 'open' ? '' : `?filter=${filter}`;

  const threads = useApi<ThreadRow[]>(
    allowed ? `/message-threads?${FILTER_QUERY[filter]}` : null,
    20_000,
  );

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const open = (id: string) => router.push(`/messages/${id}${suffix}`);

  return (
    <>
      <PageHeader title="Messages" description="Conversations with patients." />
      <Card className="flex h-[calc(100dvh-14rem)] min-h-[32rem] overflow-hidden">
        <section
          aria-label="Conversations"
          className={`${selectedId ? 'hidden lg:flex' : 'flex'} w-full flex-col border-line lg:w-[380px] lg:shrink-0 lg:border-r`}
        >
          <div className="px-6">
            <Tabs<FilterKey>
              label="Conversation filters"
              value={filter}
              onChange={(key) =>
                router.push(
                  `/messages${selectedId ? `/${selectedId}` : ''}${key === 'open' ? '' : `?filter=${key}`}`,
                )
              }
              tabs={[
                { key: 'open', label: 'Open' },
                { key: 'mine', label: 'Mine' },
                { key: 'closed', label: 'Closed' },
              ]}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.errorStatus !== undefined && !threads.data ? (
              <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <WarningCircle size={24} aria-hidden="true" className="text-fg-subtle" />
                <p className="text-sm text-fg-muted">
                  {threads.errorMessage ?? 'This could not be loaded.'}
                </p>
                <Button variant="secondary" onClick={threads.reload}>
                  Try again
                </Button>
              </div>
            ) : threads.loading ? (
              <div className="divide-y divide-line">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col gap-2 px-6 py-5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                ))}
              </div>
            ) : threads.data && threads.data.length === 0 ? (
              <EmptyState
                icon={ChatsCircle}
                title={EMPTY[filter].title}
                description={EMPTY[filter].description}
              />
            ) : (
              <ul className="divide-y divide-line">
                {threads.data?.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => open(t.id)}
                      aria-current={t.id === selectedId ? 'true' : undefined}
                      className={`flex w-full cursor-pointer flex-col gap-2 px-6 py-5 text-left transition-colors hover:bg-surface-muted ${
                        t.id === selectedId ? 'bg-primary-subtle' : ''
                      }`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <PersonCell name={fullName(t.patient)} />
                        <span className="tabular shrink-0 pt-1 text-xs text-fg-subtle">
                          {lastSeen(t.lastMessageAt)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-3 pl-11">
                        <span className="truncate text-sm text-fg-muted">{t.subject}</span>
                        {t.unreadCount > 0 && (
                          <Badge tone="info">
                            {t.unreadCount}
                            <span className="sr-only"> unread</span>
                          </Badge>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section
          aria-label="Conversation"
          className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}
        >
          {selectedId ? (
            <Conversation
              key={selectedId}
              threadId={selectedId}
              onBack={() => router.push(`/messages${suffix}`)}
              onChanged={threads.reload}
            />
          ) : (
            <EmptyState
              icon={ChatsCircle}
              title="Choose a conversation"
              description="Select a patient on the left to read and reply."
            />
          )}
        </section>
      </Card>
    </>
  );
}

export function Inbox({ selectedId }: { selectedId?: string }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <InboxInner selectedId={selectedId} />
    </Suspense>
  );
}
