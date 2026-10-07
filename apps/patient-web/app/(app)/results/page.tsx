'use client';

import { Flask, TrendDown, TrendUp } from '@phosphor-icons/react';
import {
  BackLink,
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

/** Out of range first, so the result that matters most is the one shown in full. */
function pickFeatured(tests: Test[]): Test | undefined {
  const drawn = tests.filter((t) => drawable(t.result));
  const out = drawn.find((t) => {
    const r = t.result!;
    return judge(parseValue(r.resultValue)!, parseRange(r.referenceRange)!) !== 'within';
  });
  return out ?? drawn[0];
}

/**
 * Test results by date (design system 18.3, 18.6; the prototype's
 * results screen): tests still at the lab as one ruled line, the newest
 * visit's most telling result in full (big value, ruler, trend), and
 * every other result as a compact row with its value and a word.
 */
export default function ResultsPage() {
  const labs = useApi<LabOrder[]>('/patients/me/lab-orders');
  const groups = labs.data ? groupByDay(labs.data) : [];
  const history = labs.data ? historyByTest(labs.data) : new Map<string, Point[]>();
  // Tests still waiting for the lab, from every visit, newest first.
  const waiting = groups.flatMap((g) => g.tests.filter((t) => !t.result));
  const withResults = groups
    .map((g) => ({ ...g, tests: g.tests.filter((t) => t.result) }))
    .filter((g) => g.tests.length > 0);
  const featuredIndex = withResults.findIndex((g) => g.tests.some((t) => drawable(t.result)));
  const featuredGroup = withResults[featuredIndex];
  const featured = featuredGroup ? pickFeatured(featuredGroup.tests) : undefined;

  return (
    <div>
      <BackLink href="/records">Records</BackLink>
      <PageTitle
        title="Test results"
        description={
          featuredGroup
            ? `From your visit on ${formatDayMonth(featuredGroup.date)}`
            : 'Your test results, newest first.'
        }
      />
      <div className="flex flex-col gap-7">
        <Note title="Your doctor will go through these with you">
          A value outside the range is not always a cause for worry.
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
          <>
            {waiting.length > 0 && (
              <section
                aria-labelledby="waiting"
                className="flex flex-col gap-1 border-t border-fg pt-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="waiting" className="font-semibold">
                    Tests at the lab
                  </h2>
                  <Chip>Waiting for results</Chip>
                </div>
                <p className="text-fg-muted">{waiting.map((t) => t.testName).join(', ')}</p>
              </section>
            )}

            {withResults.map((group, index) => {
              const others = group.tests.filter((t) => t !== featured);
              return (
                <section key={group.date} aria-labelledby={`tests-${index}`}>
                  <h2
                    id={`tests-${index}`}
                    className={
                      index === featuredIndex
                        ? 'sr-only'
                        : 'flex items-baseline justify-between gap-4 pb-1 text-sm text-fg-muted'
                    }
                  >
                    <span className="font-semibold text-fg">
                      {index === featuredIndex ? 'Results' : 'Earlier results'}
                    </span>{' '}
                    <span>{formatDate(group.date)}</span>
                  </h2>
                  {index === featuredIndex && featured && (
                    <FeaturedTest
                      test={featured}
                      points={history.get(featured.testName.trim().toLowerCase()) ?? []}
                    />
                  )}
                  {others.length > 0 && (
                    <Rows className="border-t border-fg">
                      {others.map((test) => (
                        <li key={test.id}>
                          <TestRow test={test} />
                        </li>
                      ))}
                    </Rows>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** One result in full: the big value, the ruler, and the trend when there is more than one. */
function FeaturedTest({ test, points }: { test: Test; points: Point[] }) {
  const result = test.result!;
  const value = parseValue(result.resultValue)!;
  const range = parseRange(result.referenceRange)!;
  const verdict = judge(value, range);
  return (
    <article className="border-t border-fg pb-6 pt-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold">{test.testName}</h3>
          <p className="text-sm text-fg-muted">Tested {formatDate(result.createdAt)}</p>
        </div>
        <VerdictWord verdict={verdict} />
      </div>
      <p className="mt-3 flex items-baseline">
        <span className="tabular font-mono text-[3.8rem] font-medium leading-none tracking-[-0.02em]">
          {result.resultValue}
        </span>
        {result.unit && <span className="ml-1.5 text-fg-muted">{result.unit}</span>}
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

  const Arrow = last.value < before.value ? TrendDown : last.value > before.value ? TrendUp : null;

  return (
    <p className={`mt-4 flex flex-wrap items-center gap-x-1.5 text-sm ${words.tone}`}>
      {Arrow && <Arrow size={16} aria-hidden="true" />}
      <span className="font-medium">{words.text}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular font-mono">{shown.map((p) => p.value).join(' → ')}</span>
      <span>since {formatMonthShort(shown[0]!.at)}</span>
    </p>
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
    <div className="grid grid-cols-[1fr_auto_4.5rem] items-center gap-3 py-3">
      <div className="min-w-0">
        <p className="font-semibold">{test.testName}</p>
        {result.referenceRange && (
          <p className="text-sm text-fg-muted">
            Normal {result.referenceRange}
            {result.unit && ` ${result.unit}`}
          </p>
        )}
      </div>
      <p className="tabular text-right font-mono text-[1.3rem]">
        {result.resultValue}
        {!result.referenceRange && result.unit && (
          <span className="ml-1 font-sans text-sm text-fg-muted">{result.unit}</span>
        )}
      </p>
      <span className="text-right">
        {verdict && <StatusWord tone={TONE[verdict]}>{SHORT[verdict]}</StatusWord>}
      </span>
    </div>
  );
}
