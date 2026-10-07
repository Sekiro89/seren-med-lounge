'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, PaperPlaneRight, WarningCircle } from '@phosphor-icons/react';
import { roleHasPermission } from '@serenemed/permissions';
import type { StaffRole } from '@serenemed/types';
import { Button } from '../../../../components/ui/button';
import { Select, Textarea } from '../../../../components/ui/fields';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, fullName, humanize } from '../../../../lib/format';
import { useApi } from '../../../../lib/use-api';
import { messageOf, type ThreadDetail } from './helpers';

/** The open conversation: header actions, bubbles, and a composer pinned to the bottom. */
export function Conversation({
  threadId,
  onBack,
  onChanged,
}: {
  threadId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const thread = useApi<ThreadDetail>(`/message-threads/${threadId}`, 10_000);
  const directory = useApi<{ id: string; fullName: string; role: string }[]>('/users/directory');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [acting, setActing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const data = thread.data?.id === threadId ? thread.data : undefined;
  const count = data?.messages.length ?? 0;

  // Opening a thread marks it read on the server, so refresh the list's counts.
  useEffect(() => {
    if (data) onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count, data?.id]);

  const assignees = useMemo(
    () =>
      (directory.data ?? []).filter((u) =>
        roleHasPermission(u.role as StaffRole, 'message:manage'),
      ),
    [directory.data],
  );

  const run = async (path: string, body?: unknown) => {
    setActing(true);
    setError(undefined);
    try {
      await apiClient.post(`/message-threads/${threadId}/${path}`, body);
      thread.reload();
      onChanged();
    } catch (e) {
      setError(messageOf(e, 'That could not be saved. Please try again.'));
    } finally {
      setActing(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(undefined);
    try {
      await apiClient.post(`/message-threads/${threadId}/messages`, { body });
      setDraft('');
      thread.reload();
      onChanged();
    } catch (e) {
      setError(messageOf(e, 'The message was not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  if (thread.errorStatus !== undefined && !data) {
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <WarningCircle size={24} aria-hidden="true" className="text-fg-subtle" />
        <p className="text-sm text-fg-muted">
          {thread.errorStatus === 404
            ? 'This conversation could not be found.'
            : (thread.errorMessage ?? 'This could not be loaded.')}
        </p>
        <Button variant="secondary" onClick={thread.reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-1/2" />
        <Skeleton className="h-16 w-3/5" />
      </div>
    );
  }

  const closed = data.status === 'CLOSED';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-2.5 sm:px-8">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          icon={<ArrowLeft size={16} aria-hidden="true" />}
          onClick={onBack}
        >
          Inbox
        </Button>
        <div className="mr-auto min-w-0">
          <h2 className="truncate text-sm font-semibold text-fg">{fullName(data.patient)}</h2>
          <p className="truncate text-[12px] text-fg-muted">
            {data.subject} ·{' '}
            <span className="tabular font-mono">
              {data.messages.length} {data.messages.length === 1 ? 'message' : 'messages'}
            </span>
          </p>
        </div>
        <div className="w-48">
          <label htmlFor="assignee" className="sr-only">
            Assigned to
          </label>
          <Select
            id="assignee"
            value={data.assignedTo?.id ?? ''}
            disabled={acting}
            onChange={(e) => e.target.value && run('assign', { assignedToId: e.target.value })}
          >
            <option value="" disabled>
              Unassigned
            </option>
            {data.assignedTo && !assignees.some((u) => u.id === data.assignedTo?.id) && (
              <option value={data.assignedTo.id}>{data.assignedTo.fullName}</option>
            )}
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({humanize(u.role)})
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={acting}
          onClick={() => run(closed ? 'reopen' : 'close')}
        >
          {closed ? 'Reopen' : 'Close conversation'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 sm:px-8">
        {/* A ruled transcript: who and when in the margin, the words beside it. */}
        <ol className="divide-y divide-line">
          {data.messages.map((m) => {
            const mine = m.senderType === 'USER';
            return (
              <li
                key={m.id}
                className="grid grid-cols-1 gap-x-6 gap-y-1 py-4 sm:grid-cols-[150px_minmax(0,1fr)]"
              >
                <div className="text-[12px] leading-5">
                  <p className={`font-medium ${mine ? 'text-primary' : 'text-fg'}`}>
                    {mine ? (m.senderUser?.fullName ?? 'Staff') : data.patient.firstName}
                  </p>
                  <p className="tabular font-mono text-fg-subtle">
                    {formatDate(m.createdAt).slice(0, 6)} {formatTime(m.createdAt)}
                  </p>
                </div>
                <p
                  className={`max-w-[72ch] whitespace-pre-wrap text-[15px] leading-6 text-fg ${
                    mine ? 'border-l-2 border-primary-line pl-3' : ''
                  }`}
                >
                  {m.body}
                </p>
              </li>
            );
          })}
        </ol>
        <div ref={endRef} />
      </div>

      <div className="border-t border-line bg-surface px-5 py-3 sm:px-8">
        {error && (
          <p role="alert" className="mb-3 text-sm text-danger-fg">
            {error}
          </p>
        )}
        {closed ? (
          <p className="text-sm text-fg-muted">
            This conversation is closed. Reopen it to send a reply.
          </p>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="composer" className="sr-only">
                Reply
              </label>
              <Textarea
                id="composer"
                rows={2}
                value={draft}
                maxLength={5000}
                placeholder="Write a reply. Enter sends, Shift+Enter adds a line."
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
            </div>
            <Button
              loading={sending}
              disabled={!draft.trim()}
              icon={<PaperPlaneRight size={18} aria-hidden="true" />}
              onClick={send}
            >
              Send
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
