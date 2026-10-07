'use client';

import { useState, type ReactNode } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Skeleton } from './skeleton';

const PAGE_SIZE = 25;

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Numbers and money are right-aligned. */
  align?: 'left' | 'right';
  /** A number, money or code column: set in Plex Mono with tabular figures. */
  numeric?: boolean;
  className?: string;
}

/**
 * The main surface of every desk. 40px header band, 44px rows, the
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
  pageSize = PAGE_SIZE,
  capNotice,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
  pageSize?: number;
  /** Set when the API returned its maximum, so older rows may exist beyond this list. */
  capNotice?: string;
}) {
  const [page, setPage] = useState(0);
  const total = rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = rows?.slice(current * pageSize, (current + 1) * pageSize);
  const showEmpty = !loading && rows !== undefined && rows.length === 0;

  return (
    <div className="overflow-x-auto [background:linear-gradient(to_right,var(--surface)_30%,transparent),linear-gradient(to_left,var(--surface)_30%,transparent)_100%_0,radial-gradient(farthest-side_at_0_50%,rgba(11,13,18,0.12),transparent),radial-gradient(farthest-side_at_100%_50%,rgba(11,13,18,0.12),transparent)_100%_0] [background-attachment:local,local,scroll,scroll] [background-repeat:no-repeat] [background-size:40px_100%,40px_100%,14px_100%,14px_100%]">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-muted">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`h-10 whitespace-nowrap px-4 text-xs font-medium uppercase tracking-[0.06em] text-fg-muted sm:px-6 ${
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
                  <td key={column.header} className="h-11 px-6">
                    <Skeleton className="h-4 w-full max-w-32" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            visible?.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-b border-line transition-colors last:border-0 hover:bg-surface-muted/70"
              >
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={`h-11 px-4 py-1.5 align-middle text-fg sm:px-6 ${
                      column.align === 'right' ? 'text-right' : ''
                    } ${column.numeric ? 'tabular font-mono' : ''} ${column.className ?? ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {showEmpty && empty}
      {!loading && total > pageSize && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-4 border-t border-line px-6 py-4 text-sm text-fg-muted"
        >
          <span className="tabular font-mono">
            Showing {current * pageSize + 1}-{Math.min(total, (current + 1) * pageSize)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page"
              className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-control bg-surface text-fg hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CaretLeft size={16} />
            </button>
            <span className="tabular font-mono px-2">
              Page {current + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
              aria-label="Next page"
              className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-control bg-surface text-fg hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CaretRight size={16} />
            </button>
          </div>
        </nav>
      )}
      {capNotice && !loading && (
        <p className="border-t border-line px-6 py-3 text-[13px] text-fg-subtle">{capNotice}</p>
      )}
    </div>
  );
}
