/** Monogram + wordmark. Swap for the official SVG once it's supplied. */
export function Logo({ tone = 'default' }: { tone?: 'default' | 'light' }) {
  const light = tone === 'light';
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`flex size-8 items-center justify-center rounded-control text-base font-semibold ${
          light ? 'bg-surface text-primary-subtle-fg' : 'bg-primary text-on-primary'
        }`}
      >
        S
      </span>
      <span
        className={`text-[17px] font-semibold tracking-tight ${light ? 'text-on-primary' : 'text-fg'}`}
      >
        SereneMed
      </span>
    </div>
  );
}
