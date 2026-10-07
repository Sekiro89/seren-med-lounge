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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[13px] font-medium text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold leading-8 tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
