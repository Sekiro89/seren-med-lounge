'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@serenemed/api-client';
import { ChatCenteredText, CheckCircle, Star } from '@phosphor-icons/react';
import { Field, FormError, TextArea, apiMessage } from '../../../components/form';
import {
  Button,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  IconBadge,
  PageTitle,
  SectionHeading,
  type Tone,
} from '../../../components/ui';
import { apiClient } from '../../../lib/api-client';
import { formatDate } from '../../../lib/format';
import type { PatientReview, ReviewRequest } from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';

const STAGE: Record<ReviewRequest['stage'], string> = {
  AFTER_SECOND_CONSULTATION: 'About your recent visits to the clinic.',
  AFTER_FIRST_FOLLOW_UP: 'About your follow-up visit.',
  AFTER_PROCEDURE: 'About your recent procedure.',
};

/** Where a review stands, in words. */
function reviewStatus(review: PatientReview): { label: string; tone: Tone } {
  if (!review.publishConsent) return { label: 'Private, for the clinic only', tone: 'neutral' };
  if (review.moderationStatus === 'APPROVED') return { label: 'Shared publicly', tone: 'success' };
  if (review.moderationStatus === 'REJECTED') return { label: 'Kept private', tone: 'neutral' };
  return { label: 'Waiting to be shared', tone: 'info' };
}

const COMMENT_MAX = 5000;

/**
 * Review requests the clinic has sent (rate 1 to 5, an optional comment,
 * and a choice about sharing publicly), then the patient's past reviews.
 */
export default function FeedbackPage() {
  const now = useNow();
  const requests = useApi<ReviewRequest[]>('/patients/me/review-requests');
  const reviews = useApi<PatientReview[]>('/patients/me/reviews');
  const [sent, setSent] = useState<string[]>([]);

  const open = (requests.data ?? []).filter(
    (r) => r.status === 'REQUESTED' && new Date(r.expiresAt).getTime() > now,
  );
  const past = reviews.data ?? [];

  return (
    <div>
      <PageTitle title="Feedback" description="Tell us how your visits went." />

      <div className="flex flex-col gap-10">
        <section aria-labelledby="to-review">
          <SectionHeading>
            <span id="to-review">To review</span>
          </SectionHeading>
          {requests.loading ? (
            <CardsSkeleton count={1} />
          ) : requests.error ? (
            <ErrorNote message={requests.error} onRetry={requests.reload} />
          ) : open.length === 0 ? (
            <EmptyState
              icon={ChatCenteredText}
              title="Nothing to review right now."
              description="After some visits we will ask how it went. Your answer helps us care for you better."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line border-b border-line">
              {open.map((request) => (
                <li key={request.id}>
                  {sent.includes(request.id) ? (
                    <ThankYou />
                  ) : (
                    <ReviewForm
                      request={request}
                      onSent={() => {
                        setSent((ids) => [...ids, request.id]);
                        reviews.reload();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {(reviews.loading || reviews.error || past.length > 0) && (
          <section aria-labelledby="your-reviews">
            <SectionHeading>
              <span id="your-reviews">Your reviews</span>
            </SectionHeading>
            {reviews.loading ? (
              <CardsSkeleton count={1} />
            ) : reviews.error ? (
              <ErrorNote message={reviews.error} onRetry={reviews.reload} />
            ) : (
              <ul className="flex flex-col divide-y divide-line border-b border-line">
                {past.map((review) => (
                  <li key={review.id}>
                    <PastReview review={review} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ReviewForm({ request, onSent }: { request: ReviewRequest; onSent: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(false);
  const [ratingError, setRatingError] = useState<string>();
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const id = request.id;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (rating < 1) {
      setRatingError('Choose from 1 to 5 stars.');
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      const text = comment.trim();
      await apiClient.post(`/patients/me/review-requests/${id}/review`, {
        rating,
        ...(text ? { comment: text } : {}),
        publishConsent: consent,
      });
      onSent();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiMessage(e.body, 'We could not send your review. Please try again.')
          : 'You seem to be offline. Check your connection.',
      );
      setSending(false);
    }
  }

  return (
    <article className="py-5">
      <h3 className="text-[1.06rem] font-semibold">How was your visit?</h3>
      <p className="text-fg-muted">
        {STAGE[request.stage] ?? 'About your recent visit.'} Please answer by{' '}
        {formatDate(request.expiresAt)}.
      </p>

      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-6">
        <fieldset aria-describedby={ratingError ? `${id}-rating-error` : undefined}>
          <legend className="mb-1.5 font-medium text-fg">
            Your rating
            <span aria-hidden="true" className="ml-1 text-danger-fg">
              *
            </span>
          </legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = value <= rating;
              return (
                <label
                  key={value}
                  className="flex size-13 cursor-pointer items-center justify-center rounded-control text-fg hover:bg-surface-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
                >
                  <input
                    type="radio"
                    name={`rating-${id}`}
                    value={value}
                    checked={rating === value}
                    onChange={() => {
                      setRating(value);
                      setRatingError(undefined);
                    }}
                    aria-label={value === 1 ? '1 star' : `${value} stars`}
                    className="sr-only"
                  />
                  <Star
                    size={36}
                    weight={filled ? 'fill' : 'light'}
                    className={filled ? 'text-primary' : 'text-fg-muted'}
                    aria-hidden="true"
                  />
                </label>
              );
            })}
          </div>
          {rating > 0 && (
            <p className="mt-1 text-fg-muted">
              <span className="font-mono">{rating}</span> out of{' '}
              <span className="font-mono">5</span>
            </p>
          )}
          {ratingError && (
            <p
              id={`${id}-rating-error`}
              role="alert"
              className="mt-2 text-[0.88rem] font-semibold text-danger-fg"
            >
              {ratingError}
            </p>
          )}
        </fieldset>

        <Field
          label="Anything you would like to tell us? (optional)"
          htmlFor={`${id}-comment`}
          hint={`${comment.length} of ${COMMENT_MAX} characters`}
        >
          <TextArea
            id={`${id}-comment`}
            value={comment}
            maxLength={COMMENT_MAX}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>

        <label className="flex min-h-12 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span>SereneMed may share my review publicly (without my full name).</span>
        </label>

        <FormError message={error} />

        <Button type="submit" full loading={sending}>
          Send review
        </Button>
      </form>
    </article>
  );
}

function ThankYou() {
  return (
    <div className="flex items-center gap-4 py-5">
      <IconBadge icon={CheckCircle} tone="success" />
      <div role="status">
        <p className="font-semibold">Thank you for your review</p>
        <p className="text-fg-muted">It helps us look after you and others better.</p>
      </div>
    </div>
  );
}

function PastReview({ review }: { review: PatientReview }) {
  const status = reviewStatus(review);
  return (
    <article className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1 text-primary">
          <span className="sr-only">{review.rating} out of 5 stars</span>
          {[1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              size={22}
              weight={value <= review.rating ? 'fill' : 'light'}
              className={value <= review.rating ? '' : 'text-fg-muted'}
              aria-hidden="true"
            />
          ))}
        </p>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>
      {review.comment && <p className="mt-3 whitespace-pre-line">{review.comment}</p>}
      <p className="mt-2 text-sm text-fg-muted">Sent {formatDate(review.createdAt)}</p>
    </article>
  );
}
