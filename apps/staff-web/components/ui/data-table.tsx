import type { ReactNode } from 'react';
import { Skeleton } from './skeleton';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Numbers and money are right-aligned. */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * The main surface of every desk. Sticky-looking header, 40px rows, the
 * first column identifies the row, numbers right-aligned. Loading shows
 * skeleton rows; the empty state is passed in so each table can say what
 * fills it.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  empty,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
}) {
  const showEmpty = !loading && rows !== undefined && rows.length === 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-muted">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`h-10 px-4 text-xs font-medium uppercase tracking-wide text-fg-muted ${
                  column.align === 'right' ? 'text-right' : ''
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {columns.map((column) => (
                  <td key={column.header} className="h-10 px-4">
                    <Skeleton className="h-4 w-full max-w-32" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows?.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-b border-line transition-colors last:border-0 hover:bg-primary-subtle"
              >
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={`h-10 px-4 align-middle text-fg ${
                      column.align === 'right' ? 'tabular text-right' : ''
                    } ${column.className ?? ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {showEmpty && empty}
    </div>
  );
}
