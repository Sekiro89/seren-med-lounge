/** Five stars, filled up to the rating, with a text equivalent for screen readers. */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={`block size-2 ${n <= rating ? 'bg-fg' : 'border border-fg-subtle'}`}
        />
      ))}
      <span className="sr-only">{rating} out of 5</span>
    </span>
  );
}

/**
 * The rating as a Clinical Ink figure: the number in Plex Mono, set large,
 * with five ink squares under it (filled up to the rating).
 */
export function RatingFigure({ rating }: { rating: number }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="tabular font-mono text-[28px] leading-none text-fg">
        {rating}
        <span className="ml-0.5 text-[13px] text-fg-muted">/5</span>
      </span>
      <Stars rating={rating} />
    </div>
  );
}
