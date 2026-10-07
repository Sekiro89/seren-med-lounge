import type { Icon } from '@phosphor-icons/react';
import {
  Bed,
  CalendarBlank,
  CalendarCheck,
  CheckSquare,
  ChartLineUp,
  ChatsCircle,
  ClipboardText,
  CurrencyInr,
  FirstAidKit,
  Flag,
  Flask,
  Gear,
  IdentificationCard,
  ListNumbers,
  Megaphone,
  PlugsConnected,
  Package,
  Receipt,
  ShieldCheck,
  SquaresFour,
  Star,
  Stethoscope,
  Syringe,
  Users,
} from '@phosphor-icons/react';
import { StaffRole } from '@serenemed/types';
import type { Permission } from '@serenemed/permissions';
import { can } from './permissions';

/**
 * The whole sidebar, from docs/design/DESIGN_SYSTEM.md section 6.3. Each
 * item names the permission(s) that unlock it; the menu is filtered with
 * `can()`, so a role only ever sees what it can use (hide, don't disable).
 * This only shapes the UI. The API re-checks every request.
 *
 * `anyOf` unlocks the item when the role holds at least one of them.
 * `ready: false` means the page isn't built yet and shows a placeholder.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: Icon;
  anyOf?: Permission[];
  ready: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [{ label: 'Today', href: '/today', icon: SquaresFour, ready: true }],
  },
  {
    label: 'Front desk',
    items: [
      { label: 'Patients', href: '/patients', icon: Users, anyOf: ['patient:read'], ready: true },
      {
        label: 'Appointments',
        href: '/appointments',
        icon: CalendarBlank,
        anyOf: ['appointment:read'],
        ready: true,
      },
      {
        label: 'Queue',
        href: '/queue',
        icon: ListNumbers,
        // The front desk, plus every desk a token passes through
        // (STATION_PERMISSION in @serenemed/permissions).
        anyOf: [
          'queue:manage',
          'vitals:write',
          'clinical-note:write-draft',
          'lab-result:write',
          'invoice:manage',
          'pharmacy:dispense',
        ],
        ready: true,
      },
      {
        label: 'Patient claims',
        href: '/claims',
        icon: IdentificationCard,
        anyOf: ['patient:write'],
        ready: true,
      },
    ],
  },
  {
    label: 'Clinical',
    items: [
      {
        label: 'Consultations',
        href: '/dashboard',
        icon: Stethoscope,
        anyOf: ['patient-record:read-clinical'],
        ready: true,
      },
      {
        label: 'Labs',
        href: '/labs',
        icon: Flask,
        anyOf: ['lab-order:write', 'lab-result:write'],
        ready: true,
      },
      {
        label: 'Procedures',
        href: '/procedures',
        icon: Syringe,
        anyOf: ['procedure:manage'],
        ready: true,
      },
      {
        label: 'Referrals',
        href: '/referrals',
        icon: Bed,
        anyOf: ['patient-record:read-clinical'],
        ready: true,
      },
      {
        label: 'Follow-ups',
        href: '/follow-ups',
        icon: CalendarCheck,
        anyOf: ['follow-up:manage'],
        ready: true,
      },
    ],
  },
  {
    label: 'Pharmacy',
    items: [
      {
        label: 'Dispensing',
        href: '/dispensing',
        icon: FirstAidKit,
        anyOf: ['pharmacy:dispense'],
        ready: true,
      },
      {
        label: 'Inventory',
        href: '/inventory',
        icon: Package,
        anyOf: ['inventory:manage'],
        ready: true,
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Billing',
        href: '/billing',
        icon: Receipt,
        anyOf: ['invoice:manage'],
        ready: true,
      },
      {
        label: 'Payments',
        href: '/payments',
        icon: CurrencyInr,
        anyOf: ['payment:manage'],
        ready: false,
      },
      {
        label: 'Insurance',
        href: '/insurance',
        icon: ShieldCheck,
        anyOf: ['insurance:manage'],
        ready: true,
      },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Leads', href: '/leads', icon: Megaphone, anyOf: ['lead:read'], ready: true },
      {
        label: 'Campaigns',
        href: '/campaigns',
        icon: Flag,
        anyOf: ['campaign:manage'],
        ready: true,
      },
      { label: 'Reviews', href: '/reviews', icon: Star, anyOf: ['review:manage'], ready: true },
    ],
  },
  {
    label: 'Team',
    items: [
      {
        label: 'Messages',
        href: '/messages',
        icon: ChatsCircle,
        anyOf: ['message:manage'],
        ready: true,
      },
      { label: 'Tasks', href: '/tasks', icon: CheckSquare, ready: true },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        label: 'Reports',
        href: '/reports',
        icon: ChartLineUp,
        anyOf: ['audit-log:read'],
        ready: false,
      },
      {
        label: 'Audit log',
        href: '/audit-log',
        icon: ClipboardText,
        anyOf: ['audit-log:read'],
        ready: true,
      },
      {
        label: 'Integrations',
        href: '/integrations',
        icon: PlugsConnected,
        anyOf: ['integration:manage'],
        ready: true,
      },
      {
        label: 'Staff and roles',
        href: '/staff',
        icon: Gear,
        anyOf: ['user:manage'],
        ready: true,
      },
    ],
  },
];

export function canSee(role: StaffRole | undefined, item: NavItem): boolean {
  if (!item.anyOf) return true;
  return item.anyOf.some((permission) => can(role, permission));
}

/** The menu this role sees: groups with at least one visible item. */
export function navFor(role: StaffRole | undefined): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(role, item)),
  })).filter((group) => group.items.length > 0);
}

/** Flat lookup used by placeholder pages and the page title. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV.flatMap((g) => g.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

/**
 * Where each role lands after sign in. Reception and nurses start at the
 * queue, everyone else at Today, until their own desks are built.
 */
export function homeFor(role: StaffRole | undefined): string {
  if (role === StaffRole.RECEPTION || role === StaffRole.NURSE) return '/queue';
  return '/today';
}
