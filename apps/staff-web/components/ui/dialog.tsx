'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

/**
 * Modal built on the native <dialog>: the browser traps focus, closes on
 * Esc and restores focus for us. `variant="drawer"` slides in from the
 * right (480px) for record details; the default is a centred dialog for
 * confirmations and short forms.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const placement =
    variant === 'drawer'
      ? 'ml-auto mr-0 h-dvh max-h-dvh w-full max-w-[480px] rounded-none border-l'
      : 'm-auto w-full max-w-lg rounded-panel border';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className={`${placement} border-line bg-surface p-0 text-fg backdrop:bg-fg/45`}
    >
      <div className="flex h-full max-h-dvh flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-7 py-5">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold leading-7">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line bg-surface-muted px-7 py-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
