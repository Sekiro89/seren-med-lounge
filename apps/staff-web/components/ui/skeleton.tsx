/** A placeholder shaped like the content it stands in for. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-control bg-surface-muted ${className}`}
    />
  );
}
