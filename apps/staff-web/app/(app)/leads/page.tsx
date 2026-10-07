'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Info, Megaphone, Plus, UsersThree, X, Clock } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { KPI_STRIP, KpiTile } from '../../../components/ui/kpi-tile';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { SearchBox } from '../../../components/ui/search-box';
import { Select } from '../../../components/ui/fields';
import { Tabs } from '../../../components/ui/tabs';
import { Toolbar } from '../../../components/ui/toolbar';
import { clinicToday } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { AddLeadDialog, type CampaignOption } from './_components/add-lead-dialog';
import { LeadsTable } from './_components/lead-table';
import {
  ErrorPanel,
  LEAD_SOURCES,
  SOURCE_LABELS,
  leadName,
  type LeadRow,
  type StaffOption,
} from './_components/shared';

type TabKey = 'new' | 'progress' | 'converted' | 'lost';

const IN_PROGRESS = ['CONTACTED', 'NURTURING', 'APPOINTMENT_BOOKED'];
const MATCH: Record<TabKey, (r: LeadRow) => boolean> = {
  new: (r) => r.status === 'NEW',
  progress: (r) => IN_PROGRESS.includes(r.status),
  converted: (r) => r.status === 'CONVERTED',
  lost: (r) => r.status === 'LOST',
};

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  new: {
    title: 'No new leads',
    description: 'People who have enquired and have not been contacted yet appear here.',
  },
  progress: {
    title: 'No leads in progress',
    description: 'Leads being contacted, nurtured or booked for an appointment appear here.',
  },
  converted: {
    title: 'No converted leads yet',
    description: 'A lead moves here once they are registered as a patient.',
  },
  lost: {
    title: 'No lost leads',
    description: 'Leads that decided not to come in are kept here with the reason.',
  },
};

/** Start of the current clinic month, as a timestamp. */
function monthStart(): number {
  return new Date(`${clinicToday().slice(0, 8)}01T00:00:00+05:30`).getTime();
}

export default function LeadsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'lead:read');
  const canWrite = can(user.role, 'lead:write');
  const [tab, setTab] = useState<TabKey>('new');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ name: string; duplicateId: string; count: number }>();

  const leads = useApi<LeadRow[]>(allowed ? '/leads' : null);
  const due = useApi<LeadRow[]>(allowed ? '/leads?due=today' : null);
  const campaigns = useApi<CampaignOption[]>(
    allowed && canWrite && can(user.role, 'campaign:manage') ? '/campaigns' : null,
  );
  const directory = useApi<StaffOption[]>(allowed && canWrite ? '/users/directory' : null);

  const owners = useMemo(
    () =>
      (directory.data ?? []).filter((u) => u.role === 'MARKETING' || u.role === 'ADMINISTRATOR'),
    [directory.data],
  );

  const all = leads.data;
  const open = all?.filter((r) => r.status !== 'CONVERTED' && r.status !== 'LOST').length;
  const convertedThisMonth = all?.filter(
    (r) =>
      r.status === 'CONVERTED' &&
      r.convertedAt &&
      new Date(r.convertedAt).getTime() >= monthStart(),
  ).length;
  const dueOpen = due.data?.filter((r) => r.status !== 'CONVERTED' && r.status !== 'LOST').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (all ?? []).filter(
      (r) =>
        (!source || r.source === source) &&
        (!q ||
          leadName(r).toLowerCase().includes(q) ||
          r.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))),
    );
  }, [all, search, source]);
  const rows = filtered.filter(MATCH[tab]);
  const count = (key: TabKey) => (all ? filtered.filter(MATCH[key]).length : undefined);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const reload = () => {
    leads.reload();
    due.reload();
  };
  const empty = EMPTY_COPY[tab];
  const filtering = Boolean(search.trim() || source);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Leads"
        description="People who have enquired, from first contact to becoming a patient."
        action={
          canWrite ? (
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setAdding(true)}>
              Add lead
            </Button>
          ) : undefined
        }
      />

      {notice && (
        <div
          role="status"
          className="-mt-4 flex items-start justify-between gap-4 rounded-panel bg-info-bg px-5 py-4 text-sm text-info-fg"
        >
          <p className="flex items-start gap-3">
            <Info size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              {notice.name} was added. Another open lead already uses this phone number
              {notice.count > 1 ? ` (${notice.count} leads)` : ''}. This is not a problem if it is a
              new enquiry, but you may want to{' '}
              <Link href={`/leads/${notice.duplicateId}`} className="font-medium underline">
                look at the earlier lead
              </Link>
              .
            </span>
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice(undefined)}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-surface/50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className={`grid-cols-1 sm:grid-cols-3 ${KPI_STRIP}`}>
        <KpiTile
          label="Open leads"
          value={open}
          hint="Not yet converted or lost"
          icon={UsersThree}
          loading={leads.loading}
        />
        <KpiTile
          label="Follow-up due today"
          value={dueOpen}
          hint="Open leads with a follow-up today"
          icon={Clock}
          tone="warning"
          loading={due.loading}
        />
        <KpiTile
          label="Converted this month"
          value={convertedThisMonth}
          hint="Became patients"
          icon={CheckCircle}
          tone="success"
          loading={leads.loading}
        />
      </div>

      <Card>
        <div className="px-6">
          <Tabs<TabKey>
            label="Lead stages"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'new', label: 'New', count: count('new') },
              { key: 'progress', label: 'In progress', count: count('progress') },
              { key: 'converted', label: 'Converted', count: count('converted') },
              { key: 'lost', label: 'Lost', count: count('lost') },
            ]}
          />
        </div>
        <Toolbar>
          <SearchBox
            aria-label="Search leads by name or phone"
            placeholder="Search name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
          <Select
            aria-label="Filter by source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-48"
          >
            <option value="">All sources</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Toolbar>

        {leads.errorStatus !== undefined && !leads.loading ? (
          <ErrorPanel
            message={
              leads.errorStatus === 403 ? 'You do not have access to leads.' : leads.errorMessage
            }
            onRetry={reload}
          />
        ) : (
          <LeadsTable
            rows={rows}
            loading={leads.loading}
            empty={
              <EmptyState
                icon={Megaphone}
                title={filtering ? 'No leads match' : empty.title}
                description={
                  filtering ? 'Try a different name, phone number or source.' : empty.description
                }
                action={
                  canWrite && !filtering ? (
                    <Button
                      variant="secondary"
                      icon={<Plus size={18} aria-hidden="true" />}
                      onClick={() => setAdding(true)}
                    >
                      Add lead
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}
      </Card>

      <AddLeadDialog
        open={adding}
        onClose={() => setAdding(false)}
        campaigns={campaigns.data ?? []}
        owners={owners}
        onSaved={(lead) => {
          reload();
          const dups = lead.possibleDuplicateLeadIds ?? [];
          setNotice(
            dups.length > 0
              ? { name: leadName(lead), duplicateId: dups[0]!, count: dups.length }
              : undefined,
          );
        }}
      />
    </div>
  );
}
