import Link from 'next/link';
import { LockKey } from '@phosphor-icons/react/dist/ssr';
import { EmptyState } from './empty-state';

/** A deep link to a page this role can't use: a clear 403, never a blank page. */
export function NoAccess({ homeHref = '/today' }: { homeHref?: string }) {
  return (
    <EmptyState
      icon={LockKey}
      title="You don't have access to this page"
      description="Your role doesn't include this workspace. If you think that's a mistake, ask an administrator."
      action={
        <Link
          href={homeHref}
          className="inline-flex h-9 items-center rounded-control border border-control px-4 text-sm font-medium text-fg hover:bg-surface-muted"
        >
          Back to your home
        </Link>
      }
    />
  );
}
