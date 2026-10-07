'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, LockSimple, PaperPlaneRight } from '@phosphor-icons/react';
import { Button, Card, CardsSkeleton, ErrorNote, Skeleton } from '../../../../components/ui';
import { Field, TextArea } from '../../../../components/form';
import { EmergencyNote } from '../emergency-note';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime } from '../../../../lib/format';
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
      <Link
        href="/messages"
        className="-ml-2 inline-flex min-h-12 items-center gap-2 self-start rounded-xl px-2 font-semibold text-primary"
      >
        <ArrowLeft size={20} aria-hidden="true" />
        All messages
      </Link>

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
            <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-fg">
              {thread.data.subject}
            </h1>

            <ol className="flex flex-col gap-4" aria-label="Messages">
              {thread.data.messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
            </ol>

            {closed ? (
              <Card className="flex items-center gap-3 text-fg-muted">
                <LockSimple size={22} aria-hidden="true" />
                <p>
                  This conversation is closed. To ask something new,{' '}
                  <Link href="/messages" className="font-semibold text-primary underline">
                    start a new message
                  </Link>
                  .
                </p>
              </Card>
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

function Bubble({ message }: { message: ThreadMessage }) {
  const mine = message.senderType === 'PATIENT';
  return (
    <li className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <p className="mb-1 px-1 text-sm font-semibold text-fg-muted">
        {mine ? 'You' : 'SereneMed clinic'}
      </p>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 ${
          mine
            ? 'rounded-br-md bg-primary-subtle text-primary-subtle-fg'
            : 'rounded-bl-md border border-line bg-surface text-fg shadow-card'
        }`}
      >
        {message.body}
      </div>
      <p className="mt-1 px-1 text-sm text-fg-subtle">
        <time dateTime={message.createdAt}>
          {formatDate(message.createdAt)}, {formatTime(message.createdAt)}
        </time>
      </p>
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
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
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
