import type { ReactNode } from 'react';
import { RuledBar } from '../../../../components/ui/ink';

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
  if (rows.length === 0) return <p className="py-3 text-[13px] text-fg-muted">{empty}</p>;
  const sorted = keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));
  return (
    <ul className="divide-y divide-line">
      {sorted.map((row, i) => (
        <li key={row.key} className="py-2 text-[13px]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-fg">{row.label}</span>
            <span className="tabular shrink-0 font-mono text-fg">
              {row.display ?? row.value.toLocaleString('en-IN')}
            </span>
          </div>
          <RuledBar
            value={row.value}
            max={max}
            tone={i === 0 ? 'ink' : 'muted'}
            className="mt-1.5"
          />
        </li>
      ))}
    </ul>
  );
}
