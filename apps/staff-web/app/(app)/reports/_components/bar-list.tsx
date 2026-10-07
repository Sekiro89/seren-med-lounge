import type { ReactNode } from 'react';

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** Shown at the right instead of the raw value (e.g. money or minutes). */
  display?: string;
}

/**
 * A horizontal bar per row, longest first unless `keepOrder`. Each bar
 * carries its number in text, so the length is never the only signal.
 */
export function BarList({
  rows,
  keepOrder,
  empty,
}: {
  rows: BarRow[];
  keepOrder?: boolean;
  empty: string;
}) {
  if (rows.length === 0) return <p className="px-6 py-6 text-sm text-fg-muted">{empty}</p>;
  const sorted = keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3 px-6 py-5">
      {sorted.map((row) => (
        <li key={row.key} className="text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-fg">{row.label}</span>
            <span className="tabular shrink-0 font-medium text-fg">
              {row.display ?? row.value.toLocaleString('en-IN')}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
