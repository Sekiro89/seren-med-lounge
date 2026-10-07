'use client';

import { Flask } from '@phosphor-icons/react';
import {
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  Note,
  PageTitle,
  Rows,
  StatusWord,
} from '../../../components/ui';
import { formatDate, formatDayMonth, formatMonthShort } from '../../../lib/format';
import type { LabOrder, LabResult } from '../../../lib/types';
import { useApi } from '../../../lib/use-api';
import {
  distance,
  judge,
  parseRange,
  parseValue,
  RangeRuler,
  SHORT,
  TONE,
  VerdictWord,
  type ParsedRange,
} from './range';

interface Test {
  id: string;
  testName: string;
  result: LabResult | undefined;
}

/** The latest entry wins if a result was entered more than once. */
const latest = (results: LabResult[]) =>
  [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

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
      group.tests.push({ id: item.id, testName: item.testName, result: latest(item.results) });
    }
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.tests.length > 0);
}

interface Point {
  value: number;
  at: string;
}

/** Every numeric result per test name, oldest first, for the trend line. */
function historyByTest(orders: LabOrder[]): Map<string, Point[]> {
  const map = new Map<string, Point[]>();
  for (const order of orders.filter((o) => o.status !== 'CANCELLED')) {
    for (const item of order.items) {
      const result = latest(item.results);
      const value = result ? parseValue(result.resultValue) : null;
      if (!result || value === null) continue;
      const key = item.testName.trim().toLowerCase();
      map.set(key, [...(map.get(key) ?? []), { value, at: result.createdAt }]);
    }
  }
  for (const points of map.values()) points.sort((a, b) => a.at.localeCompare(b.at));
  return map;
}

/** A result that can be drawn on the ruler: a number and a range we can read. */
const drawable = (r: LabResult | undefined) =>
  !!r && parseValue(r.resultValue) !== null && parseRange(r.referenceRange) !== null;

/** Test results by date, each value against its normal range (design system 18.3, 18.6). */
export default function ResultsPage() {
  const labs = useApi<LabOrder[]>('/patients/me/lab-orders');
  const groups = labs.data ? groupByDay(labs.data) : [];
  const history = labs.data ? historyByTest(labs.data) : new Map<string, Point[]>();
  // The newest visit with a result we can draw is shown in full; the rest are ruled rows.
  const featuredIndex = groups.findIndex((g) => g.tests.some((t) => drawable(t.result)));
  const featuredGroup = groups[featuredIndex];

  return (
    <div>
      <PageTitle
        title="Test results"
        description={
          featuredGroup
            ? `Latest results from your visit on ${formatDayMonth(featuredGroup.date)}`
            : 'Your test results, newest first.'
        }
      />
      <div className="flex flex-col gap-8">
        <Note>
          Your doctor will go through these results with you. A value outside the range is not
          always a cause for worry.
        </Note>

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
          groups.map((group, index) => {
            const featured =
              index === featuredIndex ? group.tests.filter((t) => drawable(t.result)) : [];
            const others = group.tests.filter((t) => !featured.includes(t));
            return (
              <section key={group.date} aria-labelledby={`tests-${index}`}>
                <h2
                  id={`tests-${index}`}
                  className="flex items-baseline justify-between gap-4 border-t border-fg pt-3 text-sm text-fg-muted"
                >
                  <span className="font-semibold text-fg">
                    {index === 0
                      ? 'Latest tests'
                      : index === featuredIndex
                        ? 'Results'
                        : 'Earlier tests'}
                  </span>
                  <span>{formatDate(group.date)}</span>
                </h2>
                {featured.map((test, i) => (
                  <FeaturedTest
                    key={test.id}
                    test={test}
                    points={history.get(test.testName.trim().toLowerCase()) ?? []}
                    first={i === 0}
                  />
                ))}
                {others.length > 0 && (
                  <Rows className={featured.length > 0 ? 'mt-2 border-t border-fg' : 'mt-1'}>
                    {others.map((test) => (
                      <li key={test.id}>
                        <TestRow test={test} />
                      </li>
                    ))}
                  </Rows>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

/** One result in full: the big value, the ruler, and the trend when there is more than one. */
function FeaturedTest({ test, points, first }: { test: Test; points: Point[]; first: boolean }) {
  const result = test.result!;
  const value = parseValue(result.resultValue)!;
  const range = parseRange(result.referenceRange)!;
  const verdict = judge(value, range);
  return (
    <article className={`pb-6 pt-4 ${first ? '' : 'border-t border-line'}`}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[1.06rem] font-semibold">{test.testName}</h3>
        <VerdictWord verdict={verdict} />
      </div>
      <p className="mt-2 flex items-baseline">
        <span className="tabular font-mono text-[4.2rem] font-medium leading-none tracking-[-0.03em]">
          {result.resultValue}
        </span>
        {result.unit && <span className="ml-2 text-lg text-fg-muted">{result.unit}</span>}
      </p>
      <RangeRuler
        value={result.resultValue}
        referenceRange={result.referenceRange}
        unit={result.unit}
      />
      {points.length > 1 && <Trend points={points} range={range} />}
    </article>
  );
}

/**
 * The last few values as a small line, and in words whether the newest
 * one is closer to or further from the normal range than the one before.
 */
function Trend({ points, range }: { points: Point[]; range: ParsedRange }) {
  const shown = points.slice(-4);
  const last = shown.at(-1)!;
  const before = shown.at(-2)!;
  const now = distance(last.value, range);
  const then = distance(before.value, range);
  const words =
    now < then
      ? { text: 'Closer to the normal range', tone: 'text-success-fg' }
      : now > then
        ? { text: 'Further from the normal range', tone: 'text-warning-fg' }
        : now === 0
          ? { text: 'Within the range again', tone: 'text-success-fg' }
          : { text: 'About the same', tone: 'text-fg-muted' };

  const lo = Math.min(...shown.map((p) => p.value));
  const hi = Math.max(...shown.map((p) => p.value));
  const W = 96;
  const H = 34;
  const xy = shown.map((p, i) => ({
    x: 4 + (i * (W - 8)) / (shown.length - 1),
    y: hi === lo ? H / 2 : 4 + ((hi - p.value) / (hi - lo)) * (H - 8),
  }));
  const lastOut = judge(last.value, range) !== 'within';

  return (
    <div className="mt-5 flex items-center gap-4 border-t border-line pt-3">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
        <polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          strokeWidth={1.5}
          className="stroke-fg"
        />
        {xy.map((p, i) =>
          i === xy.length - 1 ? (
            <rect
              key={i}
              x={p.x - 4}
              y={p.y - 4}
              width={8}
              height={8}
              className={lastOut ? 'fill-warning-fg' : 'fill-fg'}
            />
          ) : (
            <rect key={i} x={p.x - 3} y={p.y - 3} width={6} height={6} className="fill-fg" />
          ),
        )}
      </svg>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${words.tone}`}>{words.text}</p>
        <p className="text-sm text-fg-muted">
          <span className="tabular font-mono">{shown.map((p) => p.value).join(' → ')}</span> since{' '}
          {formatMonthShort(shown[0]!.at)}
        </p>
      </div>
    </div>
  );
}

/** A compact result: name and normal range, the value in Plex Mono, and a word. */
function TestRow({ test }: { test: Test }) {
  const { result } = test;
  if (!result) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="font-medium">{test.testName}</p>
        <Chip>Waiting for results</Chip>
      </div>
    );
  }
  const value = parseValue(result.resultValue);
  const range = parseRange(result.referenceRange);
  const verdict = value !== null && range ? judge(value, range) : null;
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{test.testName}</p>
        {result.referenceRange && (
          <p className="text-sm text-fg-muted">
            Normal {result.referenceRange}
            {result.unit && ` ${result.unit}`}
          </p>
        )}
      </div>
      <p className="tabular text-right font-mono text-2xl">
        {result.resultValue}
        {!result.referenceRange && result.unit && (
          <span className="ml-1 font-sans text-sm text-fg-muted">{result.unit}</span>
        )}
      </p>
      <span className="w-16 shrink-0 text-right">
        {verdict && <StatusWord tone={TONE[verdict]}>{SHORT[verdict]}</StatusWord>}
      </span>
    </div>
  );
}
