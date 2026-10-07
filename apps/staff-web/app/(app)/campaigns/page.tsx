'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Megaphone, Plus } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { Select } from '../../../components/ui/fields';
import { Figures, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { RuledTable } from '../../../components/ui/ruled-table';
import { Skeleton } from '../../../components/ui/skeleton';
import { formatMoney } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { ErrorPanel } from '../leads/_components/shared';
import { FunnelStrip } from './_components/funnel-bar';
import { NewCampaignDialog } from './_components/new-campaign-dialog';
import {
  CAMPAIGN_TYPES,
  CampaignStatusBadge,
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
  const router = useRouter();

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

  const rows = list.data;
  const newButton = (
    <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
      New campaign
    </Button>
  );
  const columns: Column<CampaignRow>[] = [
    {
      header: 'Campaign',
      render: (c) => (
        <Link href={`/campaigns/${c.id}`} className="block min-w-0 hover:text-primary">
          <span className="block truncate font-medium">{c.name}</span>
          <span className="block truncate text-[12px] text-fg-muted">
            {TYPE_LABELS[c.type] ?? c.type}
            {c.location ? ` · ${c.location}` : ''}
            {c.channel ? ` · ${c.channel}` : ''}
          </span>
        </Link>
      ),
    },
    {
      header: 'Dates',
      render: (c) => (
        <span className="tabular font-mono text-[12px] text-fg-muted">{dateRange(c)}</span>
      ),
    },
    {
      header: 'Leads',
      align: 'right',
      numeric: true,
      render: (c) => c._count?.leads ?? '-',
    },
    { header: 'Funnel', render: (c) => <Funnel id={c.id} />, className: 'w-64' },
    {
      header: 'Budget',
      align: 'right',
      numeric: true,
      render: (c) =>
        c.budgetMinor !== null ? (
          formatMoney(c.budgetMinor)
        ) : (
          <span className="text-fg-subtle">-</span>
        ),
    },
    { header: 'Status', render: (c) => <CampaignStatusBadge status={c.status} /> },
  ];

  return (
    <>
      <InkSheet>
        <SheetHead
          title="Campaigns"
          description="The marketing efforts and health camps that bring in leads."
          figures={
            <Figures
              loading={list.loading && !rows}
              items={[
                { label: 'Active', value: rows?.filter((c) => c.status === 'ACTIVE').length },
                { label: 'Planned', value: rows?.filter((c) => c.status === 'PLANNED').length },
                {
                  label: 'Leads brought in',
                  value: rows?.reduce((n, c) => n + (c._count?.leads ?? 0), 0),
                },
              ]}
            />
          }
          action={newButton}
        />
        <SheetBar
          actions={
            filtering ? (
              <span className="text-[12px] text-fg-subtle">Figures count the filtered list</span>
            ) : undefined
          }
        >
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
        </SheetBar>

        {!list.loading && list.errorStatus !== undefined ? (
          <ErrorPanel
            message={
              list.errorStatus === 403 ? 'You do not have access to campaigns.' : list.errorMessage
            }
            onRetry={list.reload}
          />
        ) : (
          <RuledTable
            caption="Campaigns"
            columns={columns}
            rows={rows}
            getRowKey={(c) => c.id}
            loading={list.loading}
            minWidth={880}
            onRowClick={(c) => router.push(`/campaigns/${c.id}`)}
            isMuted={(c) => c.status === 'CANCELLED' || c.status === 'COMPLETED'}
            empty={
              <EmptyState
                icon={Megaphone}
                title={filtering ? 'No campaigns match' : 'No campaigns yet'}
                description={
                  filtering
                    ? 'Try a different status or type.'
                    : 'Create a campaign or health camp, then tag new leads with it to see how it performs.'
                }
                action={filtering ? undefined : newButton}
              />
            }
          />
        )}
      </InkSheet>

      <NewCampaignDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => list.reload()}
      />
    </>
  );
}

// The list carries only a lead total, so the stage counts come from each
// campaign's detail.
function Funnel({ id }: { id: string }) {
  const detail = useApi<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}`);
  if (detail.loading) return <Skeleton className="h-2 w-40" />;
  if (!detail.data) return null;
  return (
    <span className="flex items-center gap-3">
      <FunnelStrip funnel={detail.data.funnel} total={detail.data.totalLeads} />
      {detail.data.totalLeads > 0 && (
        <span className="tabular whitespace-nowrap font-mono text-[12px] text-fg-muted">
          {detail.data.funnel.CONVERTED} converted
        </span>
      )}
    </span>
  );
}
