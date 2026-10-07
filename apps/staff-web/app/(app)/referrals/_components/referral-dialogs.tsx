'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@serenemed/api-client';
import { closeReferralSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { fullName } from '../../../../lib/format';
import type { ReferralRow } from './types';

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError && [400, 403, 409].includes(error.status)) {
    const message = (error.body as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}

/** Complete or cancel one open referral, with an optional outcome note (clinical text, never in a toast or URL). */
export function CloseReferralDialog({
  action,
  row,
  onClose,
  onSaved,
}: {
  action: 'complete' | 'cancel';
  row: ReferralRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const who = fullName(row.patient);
  const completing = action === 'complete';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = closeReferralSchema.safeParse({ outcomeNote: note.trim() || undefined });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the note.');
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/referrals/${row.id}/${action}`, parsed.data);
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'That did not go through. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={completing ? 'Complete referral' : 'Cancel referral'}
      description={
        completing
          ? `Close the referral for ${who} as done.`
          : `Cancel the referral for ${who}. This cannot be undone.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {completing ? 'Not now' : 'Keep referral'}
          </Button>
          <Button
            type="submit"
            form="close-referral-form"
            variant={completing ? 'primary' : 'danger'}
            loading={busy}
          >
            {completing ? 'Complete referral' : 'Cancel referral'}
          </Button>
        </>
      }
    >
      <form id="close-referral-form" onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label={completing ? 'Outcome note (optional)' : 'Reason (optional)'}
          htmlFor="ref-note"
        >
          <Textarea
            id="ref-note"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
