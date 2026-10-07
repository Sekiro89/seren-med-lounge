'use client';

import { Flask, Info } from '@phosphor-icons/react';
import {
  Card,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  PageTitle,
  SectionHeading,
} from '../../../components/ui';
import { formatDate } from '../../../lib/format';
import type { LabOrder, LabResult } from '../../../lib/types';
import { useApi } from '../../../lib/use-api';
import { RangeIndicator } from './range';

interface Test {
  id: string;
  testName: string;
  result: LabResult | undefined;
}

/** Orders grouped by the clinic day they were placed, newest first. Cancelled orders are hidden. */
function groupByDay(orders: LabOrder[]): Array<{ date: string; tests: Test[] }> {
  const groups = new Map<string, { date: string; tests: Test[] }>();
  const sorted = orders
    .filter((o) => o.status !== 'CANCELLED')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const order of sorted) {
    const key = formatDate(order.createdAt);
    const group = groups.get(key) ?? { date: order.createdAt, tests: [] };
    for (const item of order.items) {
      // The latest entry wins if a result was entered more than once.
      const result = [...item.results].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      group.tests.push({ id: item.id, testName: item.testName, result });
    }
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.tests.length > 0);
}

/** Test results by date, each value against its normal range (design system 18.3, 18.6). */
export default function ResultsPage() {
  const labs = useApi<LabOrder[]>('/patients/me/lab-orders');
  const groups = labs.data ? groupByDay(labs.data) : [];

  return (
    <div>
      <PageTitle title="Results" description="Your test results, newest first." />
      <div className="flex flex-col gap-10">
        <div className="flex gap-3 rounded-2xl bg-info-bg px-5 py-4 text-info-fg">
          <Info size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Your doctor will go through these results with you. A value outside the range is not
            always a cause for worry.
          </p>
        </div>

        {labs.loading ? (
          <CardsSkeleton count={2} />
        ) : labs.error ? (
          <ErrorNote message={labs.error} onRetry={labs.reload} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Flask}
            title="No test results yet"
            description="When your doctor orders a test, it will show up here, and the result will follow once the lab has it."
          />
        ) : (
          groups.map((group) => (
            <section key={group.date} aria-label={`Tests from ${formatDate(group.date)}`}>
              <SectionHeading>Tests from {formatDate(group.date)}</SectionHeading>
              <Card as="div">
                <ul className="divide-y divide-line">
                  {group.tests.map((test) => (
                    <li key={test.id} className="py-5 first:pt-0 last:pb-0">
                      <TestRow test={test} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function TestRow({ test }: { test: Test }) {
  const { result } = test;
  if (!result) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold">{test.testName}</p>
        <Chip>Waiting for results</Chip>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-bold">{test.testName}</p>
        <p className="tabular text-2xl font-bold leading-tight">
          {result.resultValue}
          {result.unit && (
            <span className="ml-1 text-base font-semibold text-fg-muted">{result.unit}</span>
          )}
        </p>
      </div>
      <RangeIndicator
        value={result.resultValue}
        referenceRange={result.referenceRange}
        unit={result.unit}
      />
    </div>
  );
}
