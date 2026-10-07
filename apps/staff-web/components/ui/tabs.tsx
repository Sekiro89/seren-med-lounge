'use client';

import type { ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** A small count shown beside the label. */
  count?: number;
}

/**
 * Underline tabs. Controlled: the page owns which tab is open. Arrow keys
 * move between tabs (roving focus) as the WAI-ARIA tabs pattern asks.
 */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  trailing,
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  trailing?: ReactNode;
}) {
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next]!.key);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="flex items-end justify-between gap-4 border-b border-line">
      <div role="tablist" aria-label={label} className="-mb-px flex gap-8 overflow-x-auto">
        {tabs.map((tab, index) => {
          const active = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`flex h-12 shrink-0 cursor-pointer items-center gap-2 border-b-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-primary-subtle-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`tabular rounded-control px-1.5 text-xs ${
                    active
                      ? 'bg-primary-subtle text-primary-subtle-fg'
                      : 'bg-surface-muted text-fg-muted'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}
