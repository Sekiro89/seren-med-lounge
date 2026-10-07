import type { ReactNode } from 'react';

/** One page title per page, with the page's single primary action at the right. */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** A small line above the title, e.g. the date. Use sparingly. */
  eyebrow?: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-fg pb-6">
      <div>
        {eyebrow && (
          <p className="mb-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            {eyebrow}
          </p>
        )}
        {/* The one serif line on the page (design system 3, serif discipline). */}
        <h1 className="font-serif text-[2rem] font-medium leading-10 tracking-tight text-fg">
          {title}
        </h1>
        {description && <p className="mt-2 text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
