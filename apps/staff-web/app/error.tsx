'use client';

import { ErrorPanel } from '../components/ui/error-panel';

export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center bg-bg px-6">
      <div className="w-full rounded-panel border border-line bg-surface shadow-card">
        <ErrorPanel reset={reset} />
      </div>
    </main>
  );
}
