'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChatCircleText, PencilSimple } from '@phosphor-icons/react';
import {
  Button,
  CardsSkeleton,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  LinkCard,
  PageTitle,
  SectionHeading,
} from '../../../components/ui';
import { Field, TextArea, TextInput } from '../../../components/form';
import { apiClient } from '../../../lib/api-client';
import { formatDate, relativeDay } from '../../../lib/format';
import type { MessageThread } from '../../../lib/types';
import { useApi } from '../../../lib/use-api';
import { EmergencyNote } from './emergency-note';

// Limits match createMessageThreadSchema in packages/validation.
const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

/**
 * Conversations with the clinic, newest first, and a form to start one.
 * The clinic replies during opening hours; this is never for emergencies.
 */
export default function MessagesPage() {
  const router = useRouter();
  const threads = useApi<Array<MessageThread & { unreadCount: number }>>(
    '/patients/me/message-threads',
  );
  const [composing, setComposing] = useState(false);

  const sorted = [...(threads.data ?? [])].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  );

  return (
    <div>
      <PageTitle
        title="Messages"
        description="Ask the clinic a question. We reply during opening hours."
      />

      <div className="flex flex-col gap-10">
        {composing ? (
          <div className="flex flex-col gap-4">
            <NewMessageForm
              onCancel={() => setComposing(false)}
              onSent={(id) => router.push(`/messages/${id}`)}
            />
            <EmergencyNote />
          </div>
        ) : (
          <Button
            full
            onClick={() => setComposing(true)}
            icon={<PencilSimple size={20} aria-hidden="true" />}
          >
            New message
          </Button>
        )}

        <section aria-labelledby="conversations">
          <SectionHeading>
            <span id="conversations">Your conversations</span>
          </SectionHeading>
          {threads.loading ? (
            <CardsSkeleton count={2} />
          ) : threads.error ? (
            <ErrorNote message={threads.error} onRetry={threads.reload} />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={ChatCircleText}
              title="No messages yet"
              description="Questions about your visits, medicines or bills can be sent here."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {sorted.map((t) => (
                <li key={t.id}>
                  <LinkCard href={`/messages/${t.id}`}>
                    <p className="font-bold">{t.subject}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-fg-muted">
                        Last message {relativeDay(t.lastMessageAt)}, {formatDate(t.lastMessageAt)}
                      </span>
                      {t.unreadCount > 0 && (
                        <Chip tone="primary">
                          {t.unreadCount === 1 ? '1 new reply' : `${t.unreadCount} new replies`}
                        </Chip>
                      )}
                      {t.status === 'CLOSED' && <Chip>Closed</Chip>}
                    </div>
                  </LinkCard>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function NewMessageForm({
  onCancel,
  onSent,
}: {
  onCancel: () => void;
  onSent: (threadId: string) => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      subject: subject.trim() ? undefined : 'Please add a subject.',
      body: body.trim() ? undefined : 'Please write your message.',
    };
    setErrors(next);
    if (next.subject || next.body) return;

    setSending(true);
    setFailed(false);
    try {
      const thread = await apiClient.post<MessageThread>('/patients/me/message-threads', {
        subject: subject.trim(),
        body: body.trim(),
      });
      onSent(thread.id);
    } catch {
      setFailed(true);
      setSending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <h2 className="text-[1.12rem] font-bold">New message</h2>
        <Field label="Subject" htmlFor="subject" error={errors.subject} required>
          <TextInput
            id="subject"
            value={subject}
            maxLength={SUBJECT_MAX}
            aria-required="true"
            invalid={!!errors.subject}
            onChange={(e) => {
              setSubject(e.target.value);
              if (errors.subject) setErrors((x) => ({ ...x, subject: undefined }));
            }}
            placeholder="For example: Question about my medicine"
          />
        </Field>
        <Field label="Message" htmlFor="body" error={errors.body} required>
          <TextArea
            id="body"
            value={body}
            maxLength={BODY_MAX}
            rows={5}
            aria-required="true"
            invalid={!!errors.body}
            onChange={(e) => {
              setBody(e.target.value);
              if (errors.body) setErrors((x) => ({ ...x, body: undefined }));
            }}
          />
        </Field>
        {failed && <ErrorNote message="Your message was not sent. Please try again." />}
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button type="submit" loading={sending} full>
            Send
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={sending} full>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
