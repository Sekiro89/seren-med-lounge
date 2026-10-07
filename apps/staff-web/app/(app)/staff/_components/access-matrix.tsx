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
import { Badge } from '../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../components/ui/card';
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Preview a role"
          description="See exactly what someone in this role gets in the menu and in their work."
          action={
            <div className="w-56">
              <label htmlFor="preview-role" className="sr-only">
                Role to preview
              </label>
              <Select
                id="preview-role"
                value={previewRole}
                onChange={(e) => setPreviewRole(e.target.value as StaffRole)}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {humanize(role)}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-fg">
              Menu they see
              <span className="ml-2 font-normal text-fg-subtle">
                {menu.reduce((n, g) => n + g.items.length, 0)} items
              </span>
            </h3>
            <ul className="flex flex-col gap-3">
              {menu.map((group, index) => (
                <li key={group.label ?? index}>
                  {group.label && (
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                      {group.label}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <Badge key={item.href} tone="info">
                        {item.label}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-fg">
              What they can do
              <span className="ml-2 font-normal text-fg-subtle">
                {granted.size} of {PERMISSIONS.length}
              </span>
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {PERMISSIONS.filter((p) => granted.has(p)).map((p) => (
                <li key={p} className="flex items-center gap-2 text-fg">
                  <Check size={16} className="shrink-0 text-success-fg" aria-hidden="true" />
                  {PERMISSION_LABELS[p].label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Full access grid"
          description="Every ability against every role. A tick means allowed."
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-muted">
                <th
                  scope="col"
                  className="sticky left-0 z-10 h-12 min-w-64 bg-surface-muted px-4 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted"
                >
                  Ability
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className={`h-12 min-w-24 px-2 text-center text-xs font-semibold leading-tight text-fg-muted ${
                      role === previewRole ? 'bg-primary-subtle text-primary-subtle-fg' : ''
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
      </Card>
    </div>
  );
}

function AreaRows({ area, previewRole }: { area: string; previewRole: StaffRole }) {
  const rows = PERMISSIONS.filter((p) => PERMISSION_LABELS[p].area === area);
  return (
    <>
      <tr className="border-b border-line bg-bg">
        <th
          colSpan={ROLES.length + 1}
          scope="colgroup"
          className="sticky left-0 h-9 px-4 text-left text-xs font-semibold uppercase tracking-wider text-fg-subtle"
        >
          {area}
        </th>
      </tr>
      {rows.map((p) => (
        <tr key={p} className="border-b border-line last:border-0 hover:bg-surface-muted/50">
          <th
            scope="row"
            className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left font-normal text-fg"
          >
            {PERMISSION_LABELS[p].label}
          </th>
          {ROLES.map((role) => {
            const allowed = ROLE_PERMISSIONS[role].includes(p);
            return (
              <td
                key={role}
                className={`px-2 py-2.5 text-center ${role === previewRole ? 'bg-primary-subtle/50' : ''}`}
              >
                {allowed ? (
                  <Check
                    size={18}
                    weight="bold"
                    className="mx-auto text-success-fg"
                    aria-label={`${humanize(role)}: allowed`}
                  />
                ) : (
                  <Minus
                    size={16}
                    className="mx-auto text-fg-subtle/60"
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
