'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellSlash } from '@phosphor-icons/react';
import { apiClient } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { formatDate, formatTime } from '../../lib/format';

interface NotificationRow {
  id: string;
  title: string;
  createdAt: string;
}

/**
 * Unread in-app notifications for the signed-in staff member (their own
 * and their role's). Polls every 30s until a push channel exists.
 * Titles never carry clinical detail by design.
 */
export function NotificationBell() {
  const { data, reload } = useApi<NotificationRow[]>('/notifications?unread=true', 30_000);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const items = data ?? [];

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

  const markRead = async (id: string) => {
    await apiClient.post(`/notifications/${id}/read`).catch(() => undefined);
    reload();
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={items.length > 0 ? `Notifications, ${items.length} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        <Bell size={20} aria-hidden="true" />
        {items.length > 0 && (
          <span className="tabular absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-4 text-on-primary">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-panel border border-line bg-surface shadow-popover">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-fg">
            Notifications
          </p>
          {items.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <BellSlash size={24} className="text-fg-subtle" aria-hidden="true" />
              <p className="mt-2 text-sm text-fg-muted">You&apos;re all caught up.</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="flex w-full cursor-pointer flex-col items-start px-4 py-3 text-left hover:bg-surface-muted"
                  >
                    <span className="text-sm font-medium text-fg">{n.title}</span>
                    <span className="mt-0.5 text-xs text-fg-subtle">
                      {formatDate(n.createdAt)}, {formatTime(n.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
