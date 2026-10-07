'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { StaffRole } from '@serenemed/types';
import { navFor } from '../../lib/nav';
import { Logo } from './logo';

/**
 * The role's menu. Items come from navFor(role), so a role only sees
 * what its permissions unlock. The active item uses the brand tint.
 */
export function Sidebar({ role, onNavigate }: { role: StaffRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = navFor(role);

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-line px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group, index) => (
          <div key={group.label ?? index} className={index > 0 ? 'mt-5' : ''}>
            {group.label && (
              <p className="mb-1.5 px-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const IconComponent = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`flex h-9 items-center gap-3 rounded-control px-2.5 text-sm font-medium transition-colors ${
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
    </nav>
  );
}
