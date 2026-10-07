'use client';

import { useState } from 'react';
import { ChatCircleText, Plus, Star, Tray, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { PersonCell } from '../../../components/ui/avatar';
import { Skeleton } from '../../../components/ui/skeleton';
import { Tabs } from '../../../components/ui/tabs';
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
import { Stars } from './_components/stars';

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
        <div key={i} className="flex flex-col gap-3 px-6 py-6">
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
    { header: 'Patient', render: (r) => <PersonCell name={fullName(r.patient)} /> },
    { header: 'Stage', render: (r) => stageLabel(r.stage) },
    {
      header: 'Status',
      render: (r) => (
        <Badge tone={REQUEST_TONES[r.status] ?? 'neutral'}>{humanize(r.status)}</Badge>
      ),
    },
    {
      header: 'Requested',
      render: (r) => <span className="tabular">{formatDate(r.createdAt)}</span>,
    },
    {
      header: 'Expires',
      render: (r) => <span className="tabular">{formatDate(r.expiresAt)}</span>,
    },
    {
      header: 'Actions',
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reviews"
        description="Ask patients for reviews and decide which ones are published."
        action={requestButton('primary')}
      />

      <Card>
        <div className="px-6">
          <Tabs<TabKey>
            label="Review lists"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'moderate', label: 'To moderate', count: pending.data?.length },
              { key: 'published', label: 'Published' },
              { key: 'requests', label: 'Requests' },
            ]}
          />
        </div>

        {actionError && (
          <p role="alert" className="border-b border-line px-6 py-4 text-sm text-danger-fg">
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
                <li key={review.id} className="flex flex-col gap-4 px-6 py-6">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Stars rating={review.rating} />
                    <span className="text-sm font-medium text-fg">{review.patient.firstName}</span>
                    <span className="text-[13px] text-fg-subtle">
                      {stageLabel(review.stage)}, {formatDate(review.createdAt)}
                    </span>
                    <Badge tone={review.publishConsent ? 'success' : 'neutral'}>
                      {review.publishConsent ? 'Agreed to publish' : 'Did not agree to publish'}
                    </Badge>
                  </div>
                  {review.comment ? (
                    <p className="max-w-3xl whitespace-pre-wrap text-[15px] leading-7 text-fg">
                      {review.comment}
                    </p>
                  ) : (
                    <p className="text-sm text-fg-subtle">
                      {review.format === 'VIDEO'
                        ? 'Video review, no written comment.'
                        : 'No comment.'}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={busyId === review.id}
                      onClick={() => act(review.id, 'approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
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
            <ul className="grid gap-6 p-6 md:grid-cols-2">
              {published.data?.map((review) => (
                <li
                  key={review.id}
                  className="flex flex-col gap-3 rounded-panel bg-surface-muted p-6"
                >
                  <Stars rating={review.rating} />
                  {review.comment && (
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-fg">
                      {review.comment}
                    </p>
                  )}
                  <p className="mt-auto text-[13px] text-fg-subtle">
                    {review.patient.firstName}, {stageLabel(review.stage)}
                    {review.moderatedAt ? `, published ${formatDate(review.moderatedAt)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'requests' &&
          (requests.errorStatus !== undefined && !requests.loading ? (
            <ErrorPanel state={requests} label="review requests" />
          ) : (
            <DataTable
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
      </Card>

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
    </div>
  );
}
