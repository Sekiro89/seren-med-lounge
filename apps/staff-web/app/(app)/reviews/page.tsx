'use client';

import { useState } from 'react';
import { ChatCircleText, Plus, Star, Tray, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { type Column } from '../../../components/ui/data-table';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import {
  Figures,
  InkFilters,
  InkSheet,
  RuledBar,
  SheetBar,
  SheetHead,
} from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { RuledTable } from '../../../components/ui/ruled-table';
import { Skeleton } from '../../../components/ui/skeleton';
import type { Tone } from '../../../lib/status';
import { apiClient } from '../../../lib/api-client';
import { formatDate, fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi, type ApiState } from '../../../lib/use-api';
import {
  messageOf,
  stageLabel,
  type PublishedRow,
  type RequestRow,
  type ReviewRow,
} from './_components/helpers';
import { RequestDialog } from './_components/request-dialog';
import { RatingFigure } from './_components/stars';

type TabKey = 'moderate' | 'published' | 'requests';

const REQUEST_TONES: Record<string, Tone> = {
  REQUESTED: 'info',
  SUBMITTED: 'success',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
};

function ErrorPanel({ state, label }: { state: ApiState<unknown>; label: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <WarningCircle size={24} aria-hidden="true" className="text-fg-subtle" />
      <p className="text-sm text-fg-muted">
        {state.errorStatus === 403
          ? `You do not have access to ${label}.`
          : (state.errorMessage ?? 'This could not be loaded.')}
      </p>
      <Button variant="secondary" onClick={state.reload}>
        Try again
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-line">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 px-8 py-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-2/3 max-w-md" />
        </div>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'review:manage');
  const [tab, setTab] = useState<TabKey>('moderate');
  const [requesting, setRequesting] = useState(false);
  const [rejecting, setRejecting] = useState<ReviewRow>();
  const [cancelling, setCancelling] = useState<RequestRow>();
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [working, setWorking] = useState(false);

  const pending = useApi<ReviewRow[]>(allowed ? '/reviews?moderationStatus=PENDING' : null);
  const published = useApi<PublishedRow[]>(allowed ? '/reviews/published' : null);
  const requests = useApi<RequestRow[]>(allowed ? '/review-requests' : null);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const average =
    published.data && published.data.length > 0
      ? (published.data.reduce((n, r) => n + r.rating, 0) / published.data.length).toFixed(1)
      : undefined;
  const openRequests = requests.data?.filter((r) => r.status === 'REQUESTED').length;

  const act = async (id: string, verb: 'approve' | 'reject') => {
    setBusyId(id);
    setActionError(undefined);
    try {
      await apiClient.post(`/reviews/${id}/${verb}`);
      pending.reload();
      published.reload();
      setRejecting(undefined);
    } catch (e) {
      setActionError(messageOf(e, 'That could not be saved. Please try again.'));
      setRejecting(undefined);
    } finally {
      setBusyId(undefined);
    }
  };

  const cancelRequest = async () => {
    if (!cancelling) return;
    setWorking(true);
    setActionError(undefined);
    try {
      await apiClient.post(`/review-requests/${cancelling.id}/cancel`);
      requests.reload();
    } catch (e) {
      setActionError(messageOf(e, 'The request could not be cancelled.'));
    } finally {
      setWorking(false);
      setCancelling(undefined);
    }
  };

  const requestColumns: Column<RequestRow>[] = [
    {
      header: 'Patient',
      render: (r) => <span className="font-medium">{fullName(r.patient)}</span>,
    },
    { header: 'Stage', render: (r) => stageLabel(r.stage) },
    {
      header: 'Status',
      render: (r) => (
        <Badge tone={REQUEST_TONES[r.status] ?? 'neutral'}>{humanize(r.status)}</Badge>
      ),
    },
    {
      header: 'Requested',
      numeric: true,
      render: (r) => formatDate(r.createdAt),
    },
    {
      header: 'Expires',
      numeric: true,
      render: (r) => <span className="text-fg-muted">{formatDate(r.expiresAt)}</span>,
    },
    {
      header: 'Actions',
      align: 'right',
      render: (r) =>
        r.status === 'REQUESTED' ? (
          <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>
            Cancel request
          </Button>
        ) : null,
    },
  ];

  const requestButton = (variant: 'primary' | 'secondary') => (
    <Button
      variant={variant}
      icon={<Plus size={18} aria-hidden="true" />}
      onClick={() => setRequesting(true)}
    >
      Request a review
    </Button>
  );

  return (
    <>
      <InkSheet>
        <SheetHead
          title="Reviews"
          description="Ask patients for reviews and decide which ones are published."
          figures={
            <Figures
              items={[
                {
                  label: 'Average rating',
                  value: published.loading ? undefined : average,
                  unit: average !== undefined ? '/5' : undefined,
                },
                { label: 'Published', value: published.data?.length },
                {
                  label: 'To moderate',
                  value: pending.data?.length,
                  tone: pending.data && pending.data.length > 0 ? 'warning' : undefined,
                },
                { label: 'Open requests', value: openRequests },
              ]}
            />
          }
          action={requestButton('primary')}
        />
        <SheetBar>
          <InkFilters<TabKey>
            label="Review lists"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'moderate', label: 'To moderate', count: pending.data?.length },
              { key: 'published', label: 'Published', count: published.data?.length },
              { key: 'requests', label: 'Requests', count: requests.data?.length },
            ]}
          />
        </SheetBar>

        {actionError && (
          <p role="alert" className="border-b border-line px-8 py-3 text-sm text-danger-fg">
            {actionError}
          </p>
        )}

        {tab === 'moderate' &&
          (pending.errorStatus !== undefined && !pending.loading ? (
            <ErrorPanel state={pending} label="reviews" />
          ) : pending.loading ? (
            <ListSkeleton />
          ) : pending.data && pending.data.length === 0 ? (
            <EmptyState
              icon={Tray}
              title="No reviews are waiting"
              description="Reviews that patients submit appear here for you to approve or reject."
              action={requestButton('secondary')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {pending.data?.map((review) => (
                <li
                  key={review.id}
                  className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-6 sm:px-8 md:grid-cols-[96px_minmax(0,1fr)_200px]"
                >
                  <RatingFigure rating={review.rating} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-fg">
                        {review.patient.firstName}
                      </span>
                      <span className="text-[12px] text-fg-muted">
                        {stageLabel(review.stage)} ·{' '}
                        <span className="tabular font-mono">{formatDate(review.createdAt)}</span>
                      </span>
                    </p>
                    {review.comment ? (
                      <p className="mt-2 max-w-[72ch] whitespace-pre-wrap text-[15px] leading-7 text-fg">
                        {review.comment}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-fg-subtle">
                        {review.format === 'VIDEO'
                          ? 'Video review, no written comment.'
                          : 'No comment.'}
                      </p>
                    )}
                    <p className="mt-3">
                      <Badge tone={review.publishConsent ? 'success' : 'neutral'}>
                        {review.publishConsent ? 'Agreed to publish' : 'Did not agree to publish'}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex gap-2 md:flex-col">
                    <Button
                      size="sm"
                      className="md:w-full"
                      loading={busyId === review.id}
                      onClick={() => act(review.id, 'approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="md:w-full"
                      disabled={busyId === review.id}
                      onClick={() => setRejecting(review)}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'published' &&
          (published.errorStatus !== undefined && !published.loading ? (
            <ErrorPanel state={published} label="published reviews" />
          ) : published.loading ? (
            <ListSkeleton />
          ) : published.data && published.data.length === 0 ? (
            <EmptyState
              icon={ChatCircleText}
              title="Nothing is published yet"
              description="Approved reviews from patients who agreed to publish appear here."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
              <ul className="divide-y divide-line lg:border-r lg:border-line">
                {published.data?.map((review) => (
                  <li
                    key={review.id}
                    className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-8 px-5 py-5 sm:px-8"
                  >
                    <RatingFigure rating={review.rating} />
                    <div className="min-w-0">
                      {review.comment && (
                        <p className="max-w-[72ch] whitespace-pre-wrap text-[15px] leading-7 text-fg">
                          {review.comment}
                        </p>
                      )}
                      <p className="mt-1.5 text-[12px] text-fg-muted">
                        {review.patient.firstName}, {stageLabel(review.stage)}
                        {review.moderatedAt ? (
                          <>
                            {' '}
                            · published{' '}
                            <span className="tabular font-mono">
                              {formatDate(review.moderatedAt)}
                            </span>
                          </>
                        ) : (
                          ''
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <section aria-labelledby="dist-h" className="px-5 py-5 sm:px-7">
                <h2 id="dist-h" className="section-rule pt-2 text-sm font-semibold text-fg">
                  Ratings
                </h2>
                <dl className="mt-2 divide-y divide-line">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const c = published.data?.filter((r) => r.rating === n).length ?? 0;
                    return (
                      <div
                        key={n}
                        className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-3 py-2 text-[13px]"
                      >
                        <dt className="tabular font-mono text-fg-muted">{n}/5</dt>
                        <RuledBar value={c} max={Math.max(1, published.data?.length ?? 1)} />
                        <dd className="tabular text-right font-mono text-fg">{c}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            </div>
          ))}

        {tab === 'requests' &&
          (requests.errorStatus !== undefined && !requests.loading ? (
            <ErrorPanel state={requests} label="review requests" />
          ) : (
            <RuledTable
              caption="Review requests"
              columns={requestColumns}
              rows={requests.data}
              getRowKey={(r) => r.id}
              loading={requests.loading}
              empty={
                <EmptyState
                  icon={Star}
                  title="No review requests yet"
                  description="Requests you send to patients are listed here with their status."
                  action={requestButton('secondary')}
                />
              }
            />
          ))}
      </InkSheet>

      <RequestDialog
        open={requesting}
        onClose={() => setRequesting(false)}
        onSaved={() => {
          requests.reload();
          setTab('requests');
        }}
      />

      <Dialog
        open={rejecting !== undefined}
        onClose={() => setRejecting(undefined)}
        title="Reject this review"
        description={rejecting ? `From ${rejecting.patient.firstName}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(undefined)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={rejecting !== undefined && busyId === rejecting.id}
              onClick={() => rejecting && act(rejecting.id, 'reject')}
            >
              Reject review
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          A rejected review is never published. This cannot be undone.
        </p>
      </Dialog>

      <Dialog
        open={cancelling !== undefined}
        onClose={() => setCancelling(undefined)}
        title="Cancel this request"
        description={cancelling ? `For ${fullName(cancelling.patient)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(undefined)}>
              Keep it
            </Button>
            <Button variant="danger" loading={working} onClick={cancelRequest}>
              Cancel request
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          The patient will no longer be able to answer this request.
        </p>
      </Dialog>
    </>
  );
}
