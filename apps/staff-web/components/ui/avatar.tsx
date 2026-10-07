import { initials } from '../../lib/format';

/**
 * Initials in a neutral circle, the only round shape on staff screens
 * (design system 14a). Decorative: the name always sits next to it.
 */
export function Avatar({ name, size = 32 }: { name: string; size?: 24 | 32 | 40 | 48 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-bg font-semibold text-neutral-fg`}
    >
      {initials(name)}
    </span>
  );
}

/** The standard "who" cell: avatar, name, optional second line. */
export function PersonCell({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="flex items-center gap-3">
      <Avatar name={name} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-medium text-fg">{name}</span>
        {sub && <span className="block truncate text-xs text-fg-subtle">{sub}</span>}
      </span>
    </span>
  );
}
