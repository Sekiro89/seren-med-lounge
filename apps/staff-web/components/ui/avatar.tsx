import { initials } from '../../lib/format';

/** Tints rotate with the name so a person keeps the same colour everywhere. */
const TINTS = [
  'bg-primary-subtle text-primary-subtle-fg',
  'bg-info-bg text-info-fg',
  'bg-warning-bg text-warning-fg',
  'bg-success-bg text-success-fg',
  'bg-neutral-bg text-neutral-fg',
];

function tintFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

/** Initials in a tinted circle. Decorative: the name always sits next to it. */
export function Avatar({ name, size = 32 }: { name: string; size?: 24 | 32 | 40 | 48 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tintFor(name)}`}
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
