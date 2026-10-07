import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';
import type { InputHTMLAttributes } from 'react';

/** A search field with the magnifier inside. Always pass an aria-label. */
export function SearchBox({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { 'aria-label': string }) {
  return (
    <div className={`relative ${className}`}>
      <MagnifyingGlass
        size={18}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
      />
      <input
        type="search"
        className="h-10 w-full rounded-control border border-control bg-surface pl-10 pr-3 text-base text-fg placeholder:text-fg-subtle"
        {...props}
      />
    </div>
  );
}
