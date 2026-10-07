import Link from 'next/link';
import { MagnifyingGlassMinus } from '@phosphor-icons/react/dist/ssr';
import { EmptyState } from '../components/ui/empty-state';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center bg-bg px-6">
      <div className="w-full rounded-panel border border-line bg-surface">
        <EmptyState
          icon={MagnifyingGlassMinus}
          title="This page doesn't exist"
          description="The link may be old or mistyped."
          action={
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-control bg-primary px-5 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              Go to your home
            </Link>
          }
        />
      </div>
    </main>
  );
}
