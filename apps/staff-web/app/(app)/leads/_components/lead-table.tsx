'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type Column } from '../../../../components/ui/data-table';
import { RuledTable } from '../../../../components/ui/ruled-table';
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
  const router = useRouter();
  const columns: Column<LeadRow>[] = [
    {
      header: 'Lead',
      render: (r) => (
        <Link href={`/leads/${r.id}`} className="block min-w-0 hover:text-primary">
          <span className="block truncate font-medium">{leadName(r)}</span>
          <span className="tabular block font-mono text-[12px] text-fg-muted">{r.phone}</span>
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
                <span className="text-fg-subtle">-</span>
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
          return <span className="text-fg-subtle">-</span>;
        }
        const late = new Date(r.nextFollowUpAt).getTime() < now;
        return (
          <span className={`tabular font-mono ${late ? 'font-medium text-danger-fg' : ''}`}>
            {formatDate(r.nextFollowUpAt)} {formatTime(r.nextFollowUpAt)}
            {late && <span className="ml-1.5 font-sans text-xs">Overdue</span>}
          </span>
        );
      },
    },
    { header: 'Status', render: (r) => <LeadStatusBadge status={r.status} /> },
  ];

  return (
    <RuledTable
      caption="Leads"
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      loading={loading}
      empty={empty}
      onRowClick={(r) => router.push(`/leads/${r.id}`)}
      isMuted={(r) => CLOSED.includes(r.status)}
    />
  );
}
