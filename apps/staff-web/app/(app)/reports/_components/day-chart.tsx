'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDate, formatMoney } from '../../../../lib/format';
import type { DayPoint } from './report-types';

const HEIGHT = 260;
const PAD = { top: 16, right: 72, bottom: 36, left: 40 };

/** A "nice" axis ceiling: 1, 2, 5 x 10^n at or above `max`. */
function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const step of [1, 2, 5, 10]) if (step * base >= max) return step * base;
  return 10 * base;
}

const shortDay = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  })
    .format(new Date(`${date}T12:00:00+05:30`))
    .replace(/\bSept\b/, 'Sep');

const compactMoney = (minor: number) => {
  const rupees = minor / 100;
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(rupees % 100_000 ? 1 : 0)}L`;
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(rupees % 1_000 ? 1 : 0)}k`;
  return `₹${rupees}`;
};

/**
 * Visits per day as bars (left axis) and the amount collected as a dashed
 * line (right axis), drawn with plain SVG. Each day has a native title for
 * hover, and the same numbers sit in a visually hidden table for screen
 * readers (design system section 9).
 */
export function DayChart({ points }: { points: DayPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = points.length;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const maxVisits = niceCeil(Math.max(0, ...points.map((p) => p.visits)));
  const maxMoney = niceCeil(Math.max(0, ...points.map((p) => p.collectedMinor)));
  const slot = innerW / Math.max(1, n);
  const barW = Math.max(2, Math.min(28, slot * 0.6));
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const yVisits = (v: number) => PAD.top + innerH - (v / maxVisits) * innerH;
  const yMoney = (v: number) => PAD.top + innerH - (v / maxMoney) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  // Enough day labels to read the axis without them overlapping (about 90px apart).
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 90))));
  // The line only runs through days with money in them; a run of zero days
  // would otherwise draw a dashed line along the baseline.
  const linePath = points
    .map((p, i) => {
      const prev = points[i - 1];
      const joined = prev && (prev.collectedMinor > 0 || p.collectedMinor > 0);
      return `${joined ? 'L' : 'M'}${x(i).toFixed(1)},${yMoney(p.collectedMinor).toFixed(1)}`;
    })
    .join(' ');
  const hasMoney = points.some((p) => p.collectedMinor > 0);

  return (
    <div ref={wrap} className="pb-2 pt-2">
      <div className="mb-2 flex flex-wrap items-center gap-5 text-[12px] text-fg-muted">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-3 bg-fg" />
          Visits
        </span>
        <span className="flex items-center gap-2">
          <svg aria-hidden="true" width="22" height="10" className="shrink-0">
            <line
              x1="0"
              y1="5"
              x2="22"
              y2="5"
              stroke="var(--primary)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <circle
              cx="11"
              cy="5"
              r="3"
              fill="var(--surface)"
              stroke="var(--primary)"
              strokeWidth="1.5"
            />
          </svg>
          Collected
        </span>
      </div>

      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label="Visits and money collected per day"
        className="block max-w-full"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + innerH * (1 - t)}
              y2={PAD.top + innerH * (1 - t)}
              stroke="var(--line)"
            />
            <text
              x={PAD.left - 8}
              y={PAD.top + innerH * (1 - t) + 4}
              textAnchor="end"
              fontSize="11"
              fontFamily="var(--font-plex-mono)"
              fill="var(--fg-subtle)"
            >
              {Math.round(maxVisits * t)}
            </text>
            {hasMoney && (
              <text
                x={width - PAD.right + 8}
                y={PAD.top + innerH * (1 - t) + 4}
                textAnchor="start"
                fontSize="11"
                fontFamily="var(--font-plex-mono)"
                fill="var(--fg-subtle)"
              >
                {compactMoney(maxMoney * t)}
              </text>
            )}
          </g>
        ))}

        {points.map((p, i) => (
          <g key={p.date}>
            <title>
              {`${formatDate(`${p.date}T12:00:00+05:30`)}: ${p.visits} visit${p.visits === 1 ? '' : 's'}, ${formatMoney(p.collectedMinor)} collected`}
            </title>
            <rect
              x={x(i) - barW / 2}
              y={yVisits(p.visits)}
              width={barW}
              height={Math.max(0, PAD.top + innerH - yVisits(p.visits))}
              fill="var(--fg)"
            />
            {i % labelEvery === 0 && (
              <text
                x={x(i)}
                y={HEIGHT - PAD.bottom + 18}
                textAnchor="middle"
                fontSize="11"
                fontFamily="var(--font-plex-mono)"
                fill="var(--fg-subtle)"
              >
                {shortDay(p.date)}
              </text>
            )}
          </g>
        ))}

        {hasMoney && n > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}
        {hasMoney &&
          points.map((p, i) =>
            p.collectedMinor > 0 ? (
              <circle
                key={p.date}
                cx={x(i)}
                cy={yMoney(p.collectedMinor)}
                r="3.5"
                fill="var(--surface)"
                stroke="var(--primary)"
                strokeWidth="1.5"
              >
                <title>{`${formatDate(`${p.date}T12:00:00+05:30`)}: ${formatMoney(p.collectedMinor)} collected`}</title>
              </circle>
            ) : null,
          )}
      </svg>

      <table className="sr-only">
        <caption>Visits and money collected per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Visits</th>
            <th scope="col">Collected</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{formatDate(`${p.date}T12:00:00+05:30`)}</th>
              <td>{p.visits}</td>
              <td>{formatMoney(p.collectedMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
