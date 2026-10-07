/**
 * The wordmark: "SereneMed" in Plex Sans 600 with "staff" in Plex Mono
 * (design system 17, until the official SVG logo is supplied).
 */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        className={`font-semibold tracking-[-0.01em] text-fg ${size === 'lg' ? 'text-[22px]' : 'text-[17px]'}`}
      >
        SereneMed
      </span>
      <span className={`font-mono text-fg-subtle ${size === 'lg' ? 'text-[13px]' : 'text-[11px]'}`}>
        staff
      </span>
    </span>
  );
}
