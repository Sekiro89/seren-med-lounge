'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { X } from '@phosphor-icons/react';
import type { StaffRole } from '@serenemed/types';
import { navFor } from '../../lib/nav';
import { Logo } from './logo';
import { NavGroupList } from './primary-nav';

/**
 * Under 1024px the tabs collapse into a menu button that opens every
 * area as a sheet (design system 6.1). A native modal <dialog>: the
 * browser traps focus, Escape closes it and focus returns to the button.
 */
export function NavSheet({
  role,
  open,
  onClose,
}: {
  role: StaffRole;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const groups = navFor(role);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label="Menu"
      className="m-0 h-dvh max-h-dvh w-full max-w-[22rem] border-r border-line bg-surface p-0 text-fg backdrop:bg-fg/45"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-9 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <NavGroupList
                key={group.label ?? 'top'}
                group={group}
                pathname={pathname}
                onNavigate={onClose}
              />
            ))}
          </div>
        </nav>
      </div>
    </dialog>
  );
}
