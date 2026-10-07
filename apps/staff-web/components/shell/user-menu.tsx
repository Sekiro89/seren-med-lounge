'use client';

import { useEffect, useRef, useState } from 'react';
import { CaretDown, SignOut } from '@phosphor-icons/react';
import { humanize } from '../../lib/format';
import { Avatar } from '../ui/avatar';
import type { StaffUser } from '../../lib/auth';

export function UserMenu({ user, onSignOut }: { user: StaffUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-10 cursor-pointer items-center gap-2.5 rounded-control pl-1 pr-2 transition-colors hover:bg-surface-muted"
      >
        <Avatar name={user.fullName} size={32} />
        <span className="hidden text-left leading-tight xl:block">
          <span className="block max-w-40 truncate text-[13px] font-medium text-fg">
            {user.fullName}
          </span>
          <span className="block text-xs text-fg-muted">{humanize(user.role)}</span>
        </span>
        <CaretDown size={14} className="text-fg-subtle" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-64 border border-control bg-surface p-1.5">
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium text-fg">{user.fullName}</p>
            <p className="text-xs text-fg-muted">{humanize(user.role)}</p>
            <p className="mt-1 truncate font-mono text-xs text-fg-subtle">{user.email}</p>
          </div>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-sm font-medium text-fg-muted hover:bg-surface-muted hover:text-fg"
          >
            <SignOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
