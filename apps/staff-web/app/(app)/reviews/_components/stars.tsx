import { Star } from '@phosphor-icons/react';

/** Five stars, filled up to the rating, with a text equivalent for screen readers. */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-primary">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={18} weight={n <= rating ? 'fill' : 'regular'} aria-hidden="true" />
      ))}
      <span className="sr-only">{rating} out of 5</span>
    </span>
  );
}
