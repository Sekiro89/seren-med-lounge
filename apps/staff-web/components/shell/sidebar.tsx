'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { StaffRole } from '@serenemed/types';
import { navFor } from '../../lib/nav';
import { humanize } from '../../lib/format';
import { Logo } from './logo';

/**
 * The role's menu. Items come from navFor(role), so a role only sees
 * what its permissions unlock. The active item uses the brand tint with a
 * short bar at its left edge.
 */
export function Sidebar({
  role,
  clinicName,
  onNavigate,
}: {
  role: StaffRole;
  clinicName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = navFor(role);

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-line px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group, index) => (
          <div key={group.label ?? index} className={index > 0 ? 'mt-6' : ''}>
            {group.label && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const IconComponent = item.icon;
                return (
                  <li key={item.href} className="relative">
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute -left-3 top-2 h-5 w-1 rounded-r-full bg-primary"
                      />
                    )}
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`flex h-9 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-primary-subtle text-primary-subtle-fg'
                          : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                      }`}
                    >
                      <IconComponent
                        size={20}
                        weight={active ? 'fill' : 'regular'}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <div className="rounded-control bg-surface-muted px-3 py-2.5">
          <p className="truncate text-[13px] font-semibold text-fg">{clinicName}</p>
          <p className="text-xs text-fg-subtle">{humanize(role)} workspace</p>
        </div>
      </div>
    </nav>
  );
}
