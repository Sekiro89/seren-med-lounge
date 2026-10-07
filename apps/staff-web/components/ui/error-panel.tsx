'use client';

import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from './button';
import { EmptyState } from './empty-state';

/** Shared body for the error boundaries: retry first, then a way out. */
export function ErrorPanel({ reset, homeHref = '/' }: { reset: () => void; homeHref?: string }) {
  return (
    <EmptyState
      icon={WarningCircle}
      title="Something went wrong"
      description="This page hit an unexpected problem. Try again, or go back to your home page."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link
            href={homeHref}
            className="inline-flex h-10 items-center rounded-control border border-control px-5 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Go home
          </Link>
        </div>
      }
    />
  );
}
