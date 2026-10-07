'use client';

import { useState, type ReactNode } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { Column } from './data-table';
import { Skeleton } from './skeleton';

const PAGE_SIZE = 25;

export interface LedgerColumn<T> extends Column<T> {
  /** A fixed width for the column (`w-[96px]`), so ledgers line up. */
  width?: string;
}

/**
 * The Clinical Ink ledger: the agenda table of the doctor's Today used for
 * every desk list. No header band, small grey column labels, 44px rows
 * split by hairlines, numbers and money right-aligned in Plex Mono, and
 * the sheet's 32px gutter on the outer columns. Same contract as
 * DataTable (columns, rows, loading, empty, pagination, cap notice).
 */
export function LedgerTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  empty,
  pageSize = PAGE_SIZE,
  capNotice,
  muted,
  selectedKey,
  minWidth = 720,
  caption,
}: {
  columns: LedgerColumn<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
  pageSize?: number;
  capNotice?: string;
  /** Rows that are finished or void read in grey. */
  muted?: (row: T) => boolean;
  /** The row open beside the list gets the cobalt marker. */
  selectedKey?: string;
  minWidth?: number;
  /** Screen-reader caption. */
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
            <tr className="h-9 border-b border-line">
              {columns.map((column, i) => (
                <th
                  key={column.header}
                  scope="col"
                  className={`whitespace-nowrap text-[11px] font-medium text-fg-muted ${pad(i)} ${
                    column.align === 'right' ? 'text-right' : ''
                  } ${column.width ?? ''}`}
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
                const key = getRowKey(row);
                const selected = key === selectedKey;
                const grey = muted?.(row) ?? false;
                return (
                  <tr
                    key={key}
                    aria-current={selected ? 'true' : undefined}
                    className={`h-11 border-b border-line transition-colors ${
                      selected ? 'bg-primary-subtle' : 'hover:bg-surface-muted'
                    } ${grey ? 'text-fg-subtle' : 'text-fg'}`}
                  >
                    {columns.map((column, i) => (
                      <td
                        key={column.header}
                        className={`relative py-1.5 align-middle ${pad(i)} ${
                          column.align === 'right' ? 'text-right' : ''
                        } ${column.numeric ? 'tabular font-mono' : ''} ${column.className ?? ''}`}
                      >
                        {i === 0 && selected && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-[3px] bg-primary"
                          />
                        )}
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
              Page {current + 1} of {pageCount}
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
