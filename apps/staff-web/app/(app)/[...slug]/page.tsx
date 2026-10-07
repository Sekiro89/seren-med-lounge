'use client';

import { usePathname } from 'next/navigation';
import { Hammer, MagnifyingGlassMinus } from '@phosphor-icons/react';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { Card } from '../../../components/ui/card';
import { PageHeader } from '../../../components/ui/page-header';
import { canSee, findNavItem, homeFor } from '../../../lib/nav';
import { useStaff } from '../../../lib/staff-context';

/**
 * Every menu item whose workspace isn't built yet lands here. A role
 * without access gets the proper "no access" page, not a blank one.
 */
export default function PlaceholderPage() {
  const pathname = usePathname();
  const user = useStaff();
  const item = findNavItem(pathname);

  if (!item) {
    return (
      <Card>
        <EmptyState
          icon={MagnifyingGlassMinus}
          title="This page doesn't exist"
          description="The link may be old or mistyped."
        />
      </Card>
    );
  }

  if (!canSee(user.role, item)) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={item.label} />
      <Card>
        <EmptyState
          icon={Hammer}
          title={`${item.label} is being built`}
          description="The backend for this workspace is ready. The screen comes next."
        />
      </Card>
    </>
  );
}
