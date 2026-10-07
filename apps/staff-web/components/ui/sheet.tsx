import type { ReactNode } from 'react';

/**
 * The document layout of the consultation page (design system 14a), for
 * records that read like it (the patient record): a white sheet cell with
 * a quiet left margin for context notes. The margin only appears when the
 * column is wide enough: put the rows inside an element with the
 * `@container` class. Sections, figures and status words come from ink.tsx.
 */
export function SheetRow({
  margin,
  marginClassName = 'pt-4',
  first = false,
  last = false,
  className = '',
  id,
  children,
}: {
  margin?: ReactNode;
  /** Vertical offset so the note lines up with the section heading. */
  marginClassName?: string;
  first?: boolean;
  last?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-28 @[880px]:grid @[880px]:grid-cols-[156px_minmax(0,1fr)] @[880px]:gap-x-6"
    >
      <div
        className={`hidden text-right text-xs leading-[1.5] text-fg-muted @[880px]:block ${marginClassName}`}
      >
        {margin}
      </div>
      <div
        className={[
          'flow-root min-w-0 border-x border-line bg-surface px-5 sm:px-10',
          first ? 'border-t' : '',
          last ? 'border-b pb-8' : '',
          className,
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

/** Lines up content (a back link, a banner) with the sheet column, past the margin. */
export function SheetAligned({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`@[880px]:pl-[180px] ${className}`}>{children}</div>;
}

/** A small mono overline in the margin: `VISIT 07 OCT 2026`. */
export function MarginLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase text-fg-muted">{children}</p>;
}
