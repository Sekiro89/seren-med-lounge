/**
 * The wordmark, as on the staff app: "SereneMed" in Plex Sans 600 with
 * "Lounge" small in Plex Mono (until the official SVG logo is supplied).
 */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        className={`font-semibold tracking-[-0.01em] text-fg ${size === 'lg' ? 'text-[1.4rem]' : 'text-[1.06rem]'}`}
      >
        SereneMed
      </span>
      <span className="font-mono text-sm text-fg-subtle">Lounge</span>
    </span>
  );
}
