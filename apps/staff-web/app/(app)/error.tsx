'use client';

import { Card } from '../../components/ui/card';
import { ErrorPanel } from '../../components/ui/error-panel';

/** Keeps the sidebar and top bar when one page fails. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card>
      <ErrorPanel reset={reset} homeHref="/today" />
    </Card>
  );
}
