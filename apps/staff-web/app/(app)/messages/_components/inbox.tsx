'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatsCircle, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Figures, InkFilters, SheetHead } from '../../../../components/ui/ink';
import { NoAccess } from '../../../../components/ui/no-access';
import { Skeleton } from '../../../../components/ui/skeleton';
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
  const rows = threads.data;
  const unread = rows?.reduce((n, t) => n + t.unreadCount, 0);

  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-[36rem] flex-col border border-line bg-surface">
      <SheetHead
        title="Messages"
        description="Conversations with patients, newest first."
        figures={
          <Figures
            loading={threads.loading && !rows}
            items={[
              {
                label: filter === 'closed' ? 'Closed' : filter === 'mine' ? 'Yours, open' : 'Open',
                value: rows?.length,
              },
              { label: 'Unread', value: unread, tone: unread ? 'warning' : undefined },
              { label: 'Unassigned', value: rows?.filter((t) => !t.assignedTo).length },
            ]}
          />
        }
      />
      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Conversations"
          className={`${selectedId ? 'hidden lg:flex' : 'flex'} w-full flex-col border-line lg:w-[380px] lg:shrink-0 lg:border-r`}
        >
          <div className="flex h-11 shrink-0 items-center border-b border-line px-5 sm:px-8">
            <InkFilters<FilterKey>
              label="Conversation filters"
              value={filter}
              onChange={(key) =>
                router.push(
                  `/messages${selectedId ? `/${selectedId}` : ''}${key === 'open' ? '' : `?filter=${key}`}`,
                )
              }
              options={[
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
                  <div key={i} className="flex flex-col gap-2 px-8 py-4">
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
                {threads.data?.map((t) => {
                  const selected = t.id === selectedId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => open(t.id)}
                        aria-current={selected ? 'true' : undefined}
                        className={`relative flex w-full cursor-pointer flex-col gap-0.5 py-3 pl-5 pr-5 text-left transition-colors sm:pl-8 sm:pr-6 ${
                          selected ? 'bg-primary-subtle' : 'hover:bg-surface-muted'
                        }`}
                      >
                        {selected && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-[3px] bg-primary"
                          />
                        )}
                        <span className="flex items-baseline justify-between gap-3">
                          <span
                            className={`truncate text-[13px] ${
                              t.unreadCount > 0 ? 'font-semibold text-fg' : 'font-medium text-fg'
                            }`}
                          >
                            {fullName(t.patient)}
                          </span>
                          <span className="tabular shrink-0 font-mono text-[12px] text-fg-subtle">
                            {lastSeen(t.lastMessageAt)}
                          </span>
                        </span>
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13px] text-fg-muted">{t.subject}</span>
                          {t.unreadCount > 0 && (
                            <span className="tabular shrink-0 font-mono text-[12px] font-medium text-primary">
                              {t.unreadCount} new
                            </span>
                          )}
                        </span>
                        <span className="truncate text-[12px] text-fg-subtle">
                          {t.assignedTo ? t.assignedTo.fullName : 'Unassigned'}
                          {t.status === 'CLOSED' ? ' · closed' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
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
      </div>
    </div>
  );
}

export function Inbox({ selectedId }: { selectedId?: string }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <InboxInner selectedId={selectedId} />
    </Suspense>
  );
}
