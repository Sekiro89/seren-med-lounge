'use client';

import { useState } from 'react';
import { Info, UsersThree } from '@phosphor-icons/react';
import { PersonCell } from '../../../components/ui/avatar';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Tabs } from '../../../components/ui/tabs';
import { formatDate, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { AccessMatrix } from './_components/access-matrix';

interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

type View = 'access' | 'team';

export default function StaffPage() {
  const user = useStaff();
  const allowed = can(user.role, 'user:manage');
  const [view, setView] = useState<View>('access');
  const team = useApi<StaffRow[]>(allowed && view === 'team' ? '/users' : null);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const columns: Column<StaffRow>[] = [
    { header: 'Name', render: (u) => <PersonCell name={u.fullName} sub={u.email} /> },
    { header: 'Role', render: (u) => <Badge tone="info">{humanize(u.role)}</Badge> },
    {
      header: 'Status',
      render: (u) =>
        u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
    },
    { header: 'Added', render: (u) => formatDate(u.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Staff and roles"
        description="Who is on the team, and exactly what each role can see and do."
      />

      <div className="mb-6 flex items-start gap-3 rounded-panel border border-info-fg/20 bg-info-bg px-4 py-3 text-sm text-info-fg">
        <Info size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          This is the proposed access plan, shown for the clinic&apos;s confirmation. The rules on
          this screen are the same rules the system enforces on every request, so what you see here
          is exactly how it behaves.
        </p>
      </div>

      <Tabs
        label="Staff and roles"
        value={view}
        onChange={setView}
        tabs={[
          { key: 'access', label: 'Roles and access' },
          { key: 'team', label: 'Team', count: team.data?.length },
        ]}
      />

      <div className="mt-6">
        {view === 'access' ? (
          <AccessMatrix currentRole={user.role} />
        ) : (
          <Card>
            <DataTable
              columns={columns}
              rows={team.data}
              getRowKey={(u) => u.id}
              loading={team.loading}
              empty={
                <EmptyState
                  icon={UsersThree}
                  title="No staff yet"
                  description="Staff accounts appear here once they are added."
                />
              }
            />
          </Card>
        )}
      </div>
    </>
  );
}
