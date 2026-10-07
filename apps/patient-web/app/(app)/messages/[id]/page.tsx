'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LockSimple, PaperPlaneRight } from '@phosphor-icons/react';
import { BackLink, Button, CardsSkeleton, ErrorNote, Skeleton } from '../../../../components/ui';
import { Field, TextArea } from '../../../../components/form';
import { EmergencyNote } from '../emergency-note';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime } from '../../../../lib/format';

/** `5 Oct`, with the year only when it is not this year. */
const formatDayShort = (iso: string) => {
  const full = formatDate(iso);
  return full.endsWith(String(new Date().getFullYear())) ? full.replace(/\s\d{4}$/, '') : full;
};
import type { MessageThreadDetail, ThreadMessage } from '../../../../lib/types';
import { useApi } from '../../../../lib/use-api';

const BODY_MAX = 5000;

/**
 * One conversation as chat bubbles: the patient on the right, the clinic
 * on the left. Staff names stay internal; replies are signed "SereneMed
 * clinic". Opening the thread marks the clinic's replies as read.
 */
export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const thread = useApi<MessageThreadDetail>(`/patients/me/message-threads/${id}`);
  const closed = thread.data?.status === 'CLOSED';

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-6">
        <BackLink href="/messages">All messages</BackLink>
      </div>

      {thread.loading ? (
        <>
          <Skeleton className="h-9 w-3/4" />
          <CardsSkeleton count={2} />
        </>
      ) : thread.error ? (
        <ErrorNote message={thread.error} onRetry={thread.reload} />
      ) : (
        thread.data && (
          <>
            <h1 className="text-[1.4rem] font-semibold leading-tight tracking-[-0.01em] text-fg lg:text-[1.6rem]">
              {thread.data.subject}
            </h1>

            <ol className="-mt-2 flex flex-col gap-3" aria-label="Messages">
              {thread.data.messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
            </ol>

            {closed ? (
              <div className="flex items-center gap-3 text-fg-muted">
                <LockSimple size={22} aria-hidden="true" />
                <p>
                  This conversation is closed. To ask something new,{' '}
                  <Link href="/messages" className="font-medium text-primary underline">
                    start a new message
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <>
                <ReplyBox threadId={id} onSent={thread.reload} />
                <EmergencyNote />
              </>
            )}
          </>
        )
      )}
    </div>
  );
}

/**
 * One message as a square bubble (the prototype's thread): the
 * patient's own on the right on a cobalt tint, the clinic's on the left
 * inside a hairline. Who and when sit small above the words.
 */
function Bubble({ message }: { message: ThreadMessage }) {
  const mine = message.senderType === 'PATIENT';
  return (
    <li
      className={`flex max-w-[85%] flex-col gap-0.5 border px-3.5 py-2.5 lg:max-w-[75%] ${
        mine ? 'self-end border-primary-subtle bg-primary-subtle' : 'self-start border-line'
      }`}
    >
      <p className="text-sm text-fg-muted">
        <span className={mine ? 'font-medium text-primary-subtle-fg' : 'font-medium text-fg'}>
          {mine ? 'You' : 'SereneMed clinic'}
        </span>{' '}
        ·{' '}
        <time dateTime={message.createdAt}>
          {formatDayShort(message.createdAt)},{' '}
          <span className="tabular font-mono">{formatTime(message.createdAt)}</span>
        </time>
      </p>
      <p className="whitespace-pre-wrap break-words text-fg">{message.body}</p>
    </li>
  );
}

function ReplyBox({ threadId, onSent }: { threadId: string; onSent: () => void }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) {
      setError('Please write your reply.');
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      await apiClient.post(`/patients/me/message-threads/${threadId}/messages`, {
        body: body.trim(),
      });
      setBody('');
      onSent();
    } catch {
      setError('Your reply was not sent. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-fg pt-3">
      <Field label="Your reply" htmlFor="reply" error={error} required>
        <TextArea
          id="reply"
          value={body}
          maxLength={BODY_MAX}
          rows={4}
          aria-required="true"
          invalid={!!error}
          onChange={(e) => {
            setBody(e.target.value);
            if (error) setError(undefined);
          }}
        />
      </Field>
      <Button
        type="submit"
        full
        loading={sending}
        icon={<PaperPlaneRight size={20} aria-hidden="true" />}
      >
        Send
      </Button>
    </form>
  );
}
