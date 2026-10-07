/** Monogram + wordmark. Swap for the official SVG once it's supplied. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-control bg-primary text-base font-semibold text-on-primary"
      >
        S
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-fg">SereneMed</span>
    </div>
  );
}
