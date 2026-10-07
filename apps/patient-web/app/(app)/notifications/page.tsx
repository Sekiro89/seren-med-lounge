'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarCheck,
  ChatCircleText,
  Checks,
  Flask,
  type Icon,
} from '@phosphor-icons/react';
import {
  BackLink,
  Button,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  IconBadge,
  PageTitle,
  type Tone,
} from '../../../components/ui';
import { apiClient } from '../../../lib/api-client';
import { formatDate, relativeDay } from '../../../lib/format';
import type { PatientNotification } from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", then a date. */
function timeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < 12 * HOUR) {
    const hours = Math.floor(diff / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (diff < 7 * 24 * HOUR) return relativeDay(iso);
  return formatDate(iso);
}

/** Where tapping a notification goes, if anywhere. */
function target(n: PatientNotification): string | null {
  if (n.entityType === 'LabOrder') return '/results';
  if (n.entityType === 'MessageThread' && n.entityId) return `/messages/${n.entityId}`;
  if (n.entityType === 'Appointment' && n.entityId) return `/appointments/${n.entityId}`;
  return null;
}

const ICON: Record<string, { icon: Icon; tone: Tone }> = {
  LabOrder: { icon: Flask, tone: 'info' },
  MessageThread: { icon: ChatCircleText, tone: 'primary' },
  Appointment: { icon: CalendarCheck, tone: 'success' },
};

/**
 * Everything the clinic has told the patient, newest first, unread ones
 * in bold with a dot. Tapping one marks it read and opens what it is about.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const now = useNow();
  const notifications = useApi<PatientNotification[]>('/patients/me/notifications');
  const [readIds, setReadIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string>();

  // Unread first (by what the server said on load, so rows do not jump when tapped), newest first.
  const list = [...(notifications.data ?? [])].sort(
    (a, b) => Number(!!a.readAt) - Number(!!b.readAt) || b.createdAt.localeCompare(a.createdAt),
  );
  const isUnread = (n: PatientNotification) => !n.readAt && !readIds.includes(n.id);
  const unread = list.filter(isUnread);

  async function open(n: PatientNotification) {
    if (isUnread(n)) {
      setReadIds((ids) => [...ids, n.id]);
      try {
        await apiClient.post(`/notifications/${n.id}/read`);
      } catch {
        // Opening what it is about matters more than the read mark.
      }
    }
    const href = target(n);
    if (href) router.push(href);
  }

  async function markAll() {
    setMarkingAll(true);
    setError(undefined);
    const results = await Promise.allSettled(
      unread.map((n) => apiClient.post(`/notifications/${n.id}/read`)),
    );
    const done = unread.filter((_, i) => results[i].status === 'fulfilled').map((n) => n.id);
    setReadIds((ids) => [...ids, ...done]);
    if (done.length < unread.length)
      setError('Some could not be marked as read. Please try again.');
    setMarkingAll(false);
  }

  return (
    <div>
      <BackLink href="/me">Me</BackLink>
      <PageTitle title="Notifications" description="Updates from the clinic. Tap one to open it." />

      {notifications.loading ? (
        <CardsSkeleton count={3} />
      ) : notifications.error ? (
        <ErrorNote message={notifications.error} onRetry={notifications.reload} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up."
          description="New results, replies and reminders from the clinic will show up here."
        />
      ) : (
        <div className="flex flex-col">
          <div className="flex min-h-12 items-center justify-between gap-3 border-t border-fg pt-1">
            <p className="text-fg-muted">
              {unread.length > 0 ? (
                <>
                  <span className="font-mono text-fg">{unread.length}</span> new
                </>
              ) : (
                'All read'
              )}
            </p>
            {unread.length > 0 && (
              <Button
                variant="quiet"
                loading={markingAll}
                onClick={markAll}
                icon={<Checks size={20} aria-hidden="true" />}
              >
                Mark all as read
              </Button>
            )}
          </div>
          {error && <ErrorNote message={error} />}
          <ul className="divide-y divide-line border-y border-line">
            {list.map((n) => {
              const fresh = isUnread(n);
              const look = ICON[n.entityType ?? ''] ?? { icon: Bell, tone: 'neutral' as Tone };
              const href = target(n);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    disabled={!href && !fresh}
                    className="flex w-full cursor-pointer items-start gap-4 py-4 text-left transition-colors hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <IconBadge icon={look.icon} />
                    <div className="min-w-0 flex-1">
                      <p className={fresh ? 'font-semibold text-fg' : 'text-fg'}>
                        {fresh && <span className="sr-only">New: </span>}
                        {n.title}
                      </p>
                      {n.body && <p className="mt-0.5 text-fg-muted">{n.body}</p>}
                      <p className="mt-1 text-sm text-fg-subtle">{timeAgo(n.createdAt, now)}</p>
                    </div>
                    {fresh && <Chip tone="primary">New</Chip>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
