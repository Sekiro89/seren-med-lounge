'use client';

import { useState } from 'react';
import { Check, Minus } from '@phosphor-icons/react';
import {
  AREA_ORDER,
  PERMISSION_LABELS,
  ROLE_PERMISSIONS,
  type Permission,
} from '@serenemed/permissions';
import { StaffRole } from '@serenemed/types';
import { InkSection } from '../../../../components/ui/ink';
import { Select } from '../../../../components/ui/fields';
import { humanize } from '../../../../lib/format';
import { navFor } from '../../../../lib/nav';

const ROLES = Object.values(StaffRole);
const PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

/**
 * What each role can do, read straight from the permission matrix the
 * API enforces (@serenemed/permissions), so this screen can never drift
 * from the real rules. Two views: a preview of one role's menu and
 * abilities, and the full grid.
 */
export function AccessMatrix({ currentRole }: { currentRole: StaffRole }) {
  const [previewRole, setPreviewRole] = useState<StaffRole>(currentRole);
  const granted = new Set<string>(ROLE_PERMISSIONS[previewRole]);
  const menu = navFor(previewRole);

  return (
    <div className="flex flex-col gap-10">
      <InkSection
        number={1}
        title="Preview a role"
        meta="Exactly what someone in this role gets in the menu and in their work."
        action={
          <div className="w-56">
            <label htmlFor="preview-role" className="sr-only">
              Role to preview
            </label>
            <Select
              id="preview-role"
              value={previewRole}
              onChange={(e) => setPreviewRole(e.target.value as StaffRole)}
              className="h-8"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {humanize(role)}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        <div className="grid gap-x-10 gap-y-6 pt-4 lg:grid-cols-2">
          <div>
            <h3 className="flex items-baseline gap-2 border-b border-line pb-2 text-[13px] font-semibold text-fg">
              Menu they see
              <span className="tabular font-mono text-[12px] font-normal text-fg-subtle">
                {menu.reduce((n, g) => n + g.items.length, 0)} items
              </span>
            </h3>
            <dl className="divide-y divide-line">
              {menu.map((group, index) => (
                <div
                  key={group.label ?? index}
                  className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 py-2 text-[13px]"
                >
                  <dt className="text-fg-muted">{group.label ?? 'Main'}</dt>
                  <dd className="text-fg">{group.items.map((item) => item.label).join(', ')}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="flex items-baseline gap-2 border-b border-line pb-2 text-[13px] font-semibold text-fg">
              What they can do
              <span className="tabular font-mono text-[12px] font-normal text-fg-subtle">
                {granted.size} of {PERMISSIONS.length}
              </span>
            </h3>
            <ul className="columns-1 gap-x-6 pt-2 text-[13px] sm:columns-2">
              {PERMISSIONS.filter((p) => granted.has(p)).map((p) => (
                <li key={p} className="flex break-inside-avoid items-start gap-2 py-1 text-fg">
                  <Check size={14} className="mt-0.5 shrink-0 text-success-fg" aria-hidden="true" />
                  {PERMISSION_LABELS[p].label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </InkSection>

      <InkSection
        number={2}
        title="Full access grid"
        meta="Every ability against every role. A tick means allowed."
      >
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-fg">
                <th
                  scope="col"
                  className="sticky left-0 z-10 h-12 min-w-64 bg-surface pr-4 text-left text-[11px] font-medium text-fg-muted"
                >
                  Ability
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className={`h-12 min-w-20 px-2 text-center text-[11px] font-medium leading-tight ${
                      role === previewRole
                        ? 'bg-primary-subtle text-primary-subtle-fg'
                        : 'text-fg-muted'
                    }`}
                  >
                    {humanize(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREA_ORDER.map((area) => (
                <AreaRows key={area} area={area} previewRole={previewRole} />
              ))}
            </tbody>
          </table>
        </div>
      </InkSection>
    </div>
  );
}

function AreaRows({ area, previewRole }: { area: string; previewRole: StaffRole }) {
  const rows = PERMISSIONS.filter((p) => PERMISSION_LABELS[p].area === area);
  return (
    <>
      <tr className="border-b border-line">
        <th
          colSpan={ROLES.length + 1}
          scope="colgroup"
          className="sticky left-0 h-9 bg-surface pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle"
        >
          {area}
        </th>
      </tr>
      {rows.map((p) => (
        <tr key={p} className="border-b border-line hover:bg-surface-muted">
          <th
            scope="row"
            className="sticky left-0 z-10 bg-surface py-2 pr-4 text-left font-normal text-fg"
          >
            {PERMISSION_LABELS[p].label}
          </th>
          {ROLES.map((role) => {
            const allowed = ROLE_PERMISSIONS[role].includes(p);
            return (
              <td
                key={role}
                className={`px-2 py-2 text-center ${role === previewRole ? 'bg-primary-subtle' : ''}`}
              >
                {allowed ? (
                  <Check
                    size={16}
                    weight="bold"
                    className="mx-auto text-success-fg"
                    aria-label={`${humanize(role)}: allowed`}
                  />
                ) : (
                  <Minus
                    size={16}
                    className="mx-auto text-control"
                    aria-label={`${humanize(role)}: not allowed`}
                  />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
