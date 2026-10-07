'use client';

import { useState } from 'react';
import { Info } from '@phosphor-icons/react';
import { Card } from '../../../components/ui/card';
import { NoAccess } from '../../../components/ui/no-access';
import { StaffRole } from '@serenemed/types';
import { Figures, InkFilters, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { AccessMatrix } from './_components/access-matrix';
import { TeamTab, type StaffRow } from './_components/team-tab';

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

  return (
    <InkSheet>
      <SheetHead
        eyebrow="Administration"
        title="Staff and roles"
        description="Who is on the team, and exactly what each role can see and do."
        figures={
          <Figures
            items={[
              { label: 'Roles', value: Object.values(StaffRole).length },
              ...(team.data
                ? [
                    {
                      label: 'Team',
                      value: team.data.length,
                      hint: `${team.data.filter((u) => u.isActive).length} active`,
                    },
                  ]
                : []),
            ]}
          />
        }
      />
      <SheetBar>
        <InkFilters
          label="Staff and roles"
          value={view}
          onChange={setView}
          options={[
            { key: 'access', label: 'Roles and access' },
            { key: 'team', label: 'Team', count: team.data?.length },
          ]}
        />
      </SheetBar>

      <div className="flex items-start gap-3 border-b border-line px-5 py-3 text-[13px] text-fg-muted sm:px-8">
        <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <p className="max-w-[90ch]">
          This is the proposed access plan, shown for the clinic&apos;s confirmation. The rules on
          this screen are the same rules the system enforces on every request, so what you see here
          is exactly how it behaves.
        </p>
      </div>

      {view === 'access' ? (
        <div className="px-5 pb-10 pt-8 sm:px-8">
          <AccessMatrix currentRole={user.role} />
        </div>
      ) : (
        <TeamTab team={team} currentUserId={user.id} />
      )}
    </InkSheet>
  );
}
