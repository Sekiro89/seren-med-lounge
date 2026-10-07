'use client';

import { useState, type ReactNode } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Skeleton } from './skeleton';
import type { Column } from './data-table';

export type { Column } from './data-table';

const PAGE_SIZE = 25;

/**
 * The Clinical Ink list (design system 9 and 14a), shaped like the doctor's
 * agenda on Today: no header band, an 11px grey header over hairline rows,
 * numbers in Plex Mono, the first and last columns inset to the sheet's
 * gutter. Same props as DataTable so a desk can swap one for the other.
 * Optional `onRowClick` makes the whole row open the record with the mouse;
 * keep a link in the first cell for the keyboard. Pass `rowLabel` only when
 * the row has no link of its own: the row then takes focus and opens with
 * Enter or Space.
 */
export function RuledTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  empty,
  pageSize = PAGE_SIZE,
  capNotice,
  onRowClick,
  rowLabel,
  isMuted,
  minWidth = 720,
  caption,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
  pageSize?: number;
  capNotice?: string;
  onRowClick?: (row: T) => void;
  /** Accessible name of a clickable row ("Open case for Imran Qureshi"). */
  rowLabel?: (row: T) => string;
  /** Finished or closed rows are set in grey, like seen patients on Today. */
  isMuted?: (row: T) => boolean;
  minWidth?: number;
  /** Screen-reader name of the table. */
  caption?: string;
}) {
  const [page, setPage] = useState(0);
  const total = rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = rows?.slice(current * pageSize, (current + 1) * pageSize);
  const showEmpty = !loading && rows !== undefined && rows.length === 0;
  const last = columns.length - 1;
  const pad = (i: number) =>
    `${i === 0 ? 'pl-5 sm:pl-8' : 'pl-3'} ${i === last ? 'pr-5 sm:pr-8' : 'pr-3'}`;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="h-9 border-b border-line text-[11px] text-fg-muted">
              {columns.map((column, i) => (
                <th
                  key={column.header}
                  scope="col"
                  className={`whitespace-nowrap font-medium ${pad(i)} ${
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
              Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} className="h-11 border-b border-line">
                  {columns.map((column, i) => (
                    <td key={column.header} className={pad(i)}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              visible?.map((row) => {
                const muted = isMuted?.(row) ?? false;
                return (
                  <tr
                    key={getRowKey(row)}
                    tabIndex={onRowClick && rowLabel ? 0 : undefined}
                    aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                    onClick={
                      onRowClick
                        ? (e) => {
                            // A link or button inside the row handles its own click.
                            if ((e.target as HTMLElement).closest('a,button,input,select,label'))
                              return;
                            onRowClick(row);
                          }
                        : undefined
                    }
                    onKeyDown={
                      onRowClick && rowLabel
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={`h-11 border-b border-line transition-colors hover:bg-surface-muted ${
                      onRowClick
                        ? 'cursor-pointer outline-none focus-visible:bg-primary-subtle'
                        : ''
                    } ${muted ? 'text-fg-subtle' : 'text-fg'}`}
                  >
                    {columns.map((column, i) => (
                      <td
                        key={column.header}
                        className={`py-1.5 align-middle ${pad(i)} ${
                          column.align === 'right' ? 'text-right' : ''
                        } ${column.numeric ? 'tabular font-mono' : ''} ${column.className ?? ''}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {showEmpty && empty}
      {!loading && total > pageSize && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-4 px-5 py-3 text-[12px] text-fg-muted sm:px-8"
        >
          <span className="tabular font-mono">
            {current * pageSize + 1}-{Math.min(total, (current + 1) * pageSize)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-control border border-control bg-surface text-fg hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CaretLeft size={14} />
            </button>
            <span className="tabular px-1 font-mono">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
              aria-label="Next page"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-control border border-control bg-surface text-fg hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CaretRight size={14} />
            </button>
          </div>
        </nav>
      )}
      {capNotice && !loading && (
        <p className="px-5 py-3 text-[12px] text-fg-subtle sm:px-8">{capNotice}</p>
      )}
    </div>
  );
}
