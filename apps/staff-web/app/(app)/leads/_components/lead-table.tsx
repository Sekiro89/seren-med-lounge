'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PersonCell } from '../../../../components/ui/avatar';
import { DataTable, type Column } from '../../../../components/ui/data-table';
import { formatDate, formatTime } from '../../../../lib/format';
import { LeadStatusBadge, SOURCE_LABELS, leadName, type LeadRow, type LeadStatus } from './shared';

const CLOSED: LeadStatus[] = ['CONVERTED', 'LOST'];

/** The one leads table, used on the Leads desk and on a campaign page. */
export function LeadsTable({
  rows,
  loading,
  empty,
  showCampaign = true,
}: {
  rows: LeadRow[] | undefined;
  loading: boolean;
  empty: React.ReactNode;
  showCampaign?: boolean;
}) {
  const [now] = useState(() => Date.now());
  const columns: Column<LeadRow>[] = [
    {
      header: 'Lead',
      render: (r) => (
        <Link
          href={`/leads/${r.id}`}
          className="block rounded-control focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <PersonCell name={leadName(r)} sub={r.phone} />
        </Link>
      ),
    },
    { header: 'Source', render: (r) => SOURCE_LABELS[r.source] ?? r.source },
    ...(showCampaign
      ? [
          {
            header: 'Campaign',
            render: (r: LeadRow) =>
              r.campaign ? (
                <Link
                  href={`/campaigns/${r.campaign.id}`}
                  className="text-primary-subtle-fg hover:underline"
                >
                  {r.campaign.name}
                </Link>
              ) : (
                <span className="text-fg-subtle">None</span>
              ),
          },
        ]
      : []),
    {
      header: 'Owner',
      render: (r) => r.owner?.fullName ?? <span className="text-fg-subtle">Unassigned</span>,
    },
    {
      header: 'Next follow-up',
      render: (r) => {
        if (!r.nextFollowUpAt || CLOSED.includes(r.status)) {
          return <span className="text-fg-subtle">Not set</span>;
        }
        const late = new Date(r.nextFollowUpAt).getTime() < now;
        return (
          <span className={`tabular ${late ? 'font-medium text-danger-fg' : ''}`}>
            {formatDate(r.nextFollowUpAt)} {formatTime(r.nextFollowUpAt)}
            {late && <span className="ml-1.5 text-xs">Overdue</span>}
          </span>
        );
      },
    },
    { header: 'Status', render: (r) => <LeadStatusBadge status={r.status} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      loading={loading}
      empty={empty}
    />
  );
}
