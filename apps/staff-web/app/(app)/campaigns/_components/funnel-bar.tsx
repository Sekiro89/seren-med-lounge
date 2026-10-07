import { FUNNEL_FILL, FUNNEL_LABELS, FUNNEL_ORDER, type Funnel } from './shared';

/** One stacked bar across the stages, with a named count for each stage underneath. */
export function FunnelBar({ funnel, total }: { funnel: Funnel; total: number }) {
  return (
    <div>
      <div
        role="img"
        aria-label={FUNNEL_ORDER.map((s) => `${FUNNEL_LABELS[s]} ${funnel[s]}`).join(', ')}
        className="flex h-4 w-full overflow-hidden bg-surface-muted"
      >
        {FUNNEL_ORDER.filter((s) => funnel[s] > 0).map((s) => (
          <div
            key={s}
            className={`${FUNNEL_FILL[s]} h-full border-r-2 border-surface last:border-r-0`}
            style={{ width: `${(funnel[s] / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {FUNNEL_ORDER.map((s) => (
          <div key={s}>
            <dt className="flex items-center gap-2 text-[13px] text-fg-muted">
              <span aria-hidden="true" className={`size-2.5 ${FUNNEL_FILL[s]}`} />
              {FUNNEL_LABELS[s]}
            </dt>
            <dd className="tabular mt-1 font-mono text-2xl font-semibold text-fg">{funnel[s]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
