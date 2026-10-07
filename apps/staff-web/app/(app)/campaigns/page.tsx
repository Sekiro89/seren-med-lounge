'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Megaphone, Plus } from '@phosphor-icons/react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Select } from '../../../components/ui/fields';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { ErrorPanel } from '../leads/_components/shared';
import { NewCampaignDialog } from './_components/new-campaign-dialog';
import {
  CAMPAIGN_TYPES,
  CampaignStatusBadge,
  FUNNEL_LABELS,
  FUNNEL_ORDER,
  dateRange,
  TYPE_LABELS,
  type CampaignDetail,
  type CampaignRow,
} from './_components/shared';

const STATUSES = [
  ['PLANNED', 'Planned'],
  ['ACTIVE', 'Active'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
] as const;

export default function CampaignsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'campaign:manage');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const query = params.toString();
  const list = useApi<CampaignRow[]>(allowed ? `/campaigns${query ? `?${query}` : ''}` : null);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const filtering = Boolean(status || type);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Campaigns"
        description="The marketing efforts and health camps that bring in leads."
        action={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            New campaign
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-44"
        >
          <option value="">All statuses</option>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-48"
        >
          <option value="">All types</option>
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>

      {list.loading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      )}

      {!list.loading && list.errorStatus !== undefined && (
        <Card>
          <ErrorPanel
            message={
              list.errorStatus === 403 ? 'You do not have access to campaigns.' : list.errorMessage
            }
            onRetry={list.reload}
          />
        </Card>
      )}

      {!list.loading && list.errorStatus === undefined && list.data?.length === 0 && (
        <Card>
          <EmptyState
            icon={Megaphone}
            title={filtering ? 'No campaigns match' : 'No campaigns yet'}
            description={
              filtering
                ? 'Try a different status or type.'
                : 'Create a campaign or health camp, then tag new leads with it to see how it performs.'
            }
            action={
              filtering ? undefined : (
                <Button
                  variant="secondary"
                  icon={<Plus size={18} aria-hidden="true" />}
                  onClick={() => setCreating(true)}
                >
                  New campaign
                </Button>
              )
            }
          />
        </Card>
      )}

      {!list.loading && list.errorStatus === undefined && list.data && list.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {list.data.map((c) => (
            <li key={c.id}>
              <CampaignCard campaign={c} />
            </li>
          ))}
        </ul>
      )}

      <NewCampaignDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => list.reload()}
      />
    </div>
  );
}

function CampaignCard({ campaign: c }: { campaign: CampaignRow }) {
  // The list carries only a lead total, so the stage counts come from the detail.
  const detail = useApi<CampaignDetail>(`/campaigns/${encodeURIComponent(c.id)}`);
  const total = detail.data?.totalLeads ?? c._count?.leads ?? 0;

  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="block h-full border border-line bg-surface p-6 transition-colors duration-150 hover:border-primary"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-fg">{c.name}</h2>
          <p className="tabular font-mono mt-1 text-[13px] text-fg-muted">{dateRange(c)}</p>
        </div>
        <CampaignStatusBadge status={c.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Badge tone="neutral">{TYPE_LABELS[c.type] ?? c.type}</Badge>
        {c.location && (
          <span className="inline-flex items-center gap-1 text-[13px] text-fg-muted">
            <MapPin size={14} aria-hidden="true" />
            {c.location}
          </span>
        )}
      </div>
      <div className="mt-6 flex items-baseline gap-2 border-t border-line pt-5">
        <span className="tabular font-mono text-2xl font-semibold text-fg">{total}</span>
        <span className="text-sm text-fg-muted">{total === 1 ? 'lead' : 'leads'}</span>
      </div>
      {detail.loading ? (
        <Skeleton className="mt-3 h-5 w-full" />
      ) : detail.data ? (
        <p className="tabular font-mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-muted">
          {FUNNEL_ORDER.map((s) => (
            <span key={s}>
              {FUNNEL_LABELS[s]}{' '}
              <span className="font-medium text-fg">{detail.data!.funnel[s]}</span>
            </span>
          ))}
        </p>
      ) : null}
    </Link>
  );
}
