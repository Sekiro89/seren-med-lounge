import { RuledBar } from '../../../../components/ui/ink';
import { FUNNEL_LABELS, FUNNEL_ORDER, type Funnel } from './shared';

/**
 * The campaign funnel as ruled rows: each stage named, its count in Plex
 * Mono, and an ink bar on a hairline (converted in cobalt, lost in grey).
 * The bar is decorative; the number is always beside it.
 */
export function FunnelBar({ funnel, total }: { funnel: Funnel; total: number }) {
  const widest = Math.max(1, ...FUNNEL_ORDER.map((s) => funnel[s]));
  return (
    <dl className="divide-y divide-line">
      {FUNNEL_ORDER.map((s, i) => (
        <div
          key={s}
          className="grid grid-cols-[24px_150px_48px_minmax(0,1fr)_56px] items-center gap-x-3 py-2 text-[13px]"
        >
          <span aria-hidden="true" className="tabular font-mono text-[11px] text-fg-subtle">
            {String(i + 1).padStart(2, '0')}
          </span>
          <dt className={s === 'LOST' ? 'text-fg-muted' : 'text-fg'}>{FUNNEL_LABELS[s]}</dt>
          <dd className="tabular text-right font-mono text-fg">{funnel[s]}</dd>
          <RuledBar
            value={funnel[s]}
            max={widest}
            tone={s === 'CONVERTED' ? 'primary' : s === 'LOST' ? 'muted' : 'ink'}
          />
          <span className="tabular text-right font-mono text-[12px] text-fg-muted">
            {total > 0 ? `${Math.round((funnel[s] / total) * 100)}%` : '-'}
          </span>
        </div>
      ))}
    </dl>
  );
}

/** The funnel squeezed into one row of a list: stacked ink segments, decorative. */
export function FunnelStrip({ funnel, total }: { funnel: Funnel; total: number }) {
  if (total === 0) return <span className="text-[12px] text-fg-subtle">No leads yet</span>;
  return (
    <span aria-hidden="true" className="flex h-2 w-full max-w-40 bg-surface-muted">
      {FUNNEL_ORDER.filter((s) => funnel[s] > 0).map((s) => (
        <span
          key={s}
          className={`h-full border-r border-surface last:border-r-0 ${
            s === 'CONVERTED' ? 'bg-primary' : s === 'LOST' ? 'bg-control' : 'bg-fg'
          }`}
          style={{ width: `${(funnel[s] / total) * 100}%` }}
        />
      ))}
    </span>
  );
}
