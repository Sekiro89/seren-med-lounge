'use client';

import Link from 'next/link';
import { ArrowUUpLeft, Check, Megaphone, Play, SkipForward } from '@phosphor-icons/react';
import { QUEUE_STATIONS, type QueueStationKey } from '@serenemed/permissions';
import { Button } from '../../../../components/ui/button';
import { InkStatus } from '../../../../components/ui/ink';
import { fullName } from '../../../../lib/format';
import {
  STATION_LABEL,
  SUGGESTED_NEXT,
  formatToken,
  formatWait,
  waitTone,
  minutesWaiting,
  workHref,
  type QueueRow,
} from './shared';

export type QueueAction = 'call' | 'start' | 'complete' | 'skip';

/**
 * One patient's token. The buttons follow the token's status, so the next
 * step is always the obvious one: Call, then Start, then hand the patient
 * on with "Send to" or Finish the visit.
 */
export function TokenCard({
  row,
  now,
  busy,
  canAct,
  showOpen,
  compact = false,
  onAct,
  onMove,
}: {
  row: QueueRow;
  now: number;
  busy: boolean;
  /** False on the whole-clinic board for tokens at a desk this role doesn't work. */
  canAct: boolean;
  /** Whether this role can open the page the work happens on. */
  showOpen: boolean;
  /** Narrow board columns: "Send to" takes its own full-width row. */
  compact?: boolean;
  onAct: (action: QueueAction) => void;
  onMove: (station: QueueStationKey) => void;
}) {
  const name = fullName(row.patient);
  const doctor = row.encounter?.appointment?.doctor?.fullName;
  const suggested = SUGGESTED_NEXT[row.station];
  const others = QUEUE_STATIONS.filter((s) => s !== row.station && !suggested.includes(s));
  const work = workHref(row);
  const minutes = minutesWaiting(row, now);

  return (
    <article
      aria-label={`Token ${formatToken(row.tokenNumber)}, ${name}`}
      className={`border bg-surface p-4 ${
        row.status === 'CALLED' || row.status === 'IN_SERVICE'
          ? 'border-control border-l-2 border-l-primary'
          : 'border-control'
      }`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4">
        <span
          className={`tabular font-mono font-medium leading-none text-fg ${compact ? 'text-[26px]' : 'text-[32px]'}`}
        >
          {formatToken(row.tokenNumber)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-fg-muted">
            <InkStatus domain="queue" status={row.status} />
            {doctor && <span className="truncate">{doctor}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-fg-muted">
            {row.status === 'WAITING' ? 'Waiting' : 'At desk'}
          </p>
          <p className={`tabular font-mono text-[18px] leading-tight ${waitTone(minutes)}`}>
            {formatWait(minutes)}
          </p>
        </div>
      </div>

      {(canAct || showOpen) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {canAct && row.status === 'WAITING' && (
            <Button
              size="sm"
              icon={<Megaphone size={16} aria-hidden="true" />}
              loading={busy}
              onClick={() => onAct('call')}
            >
              Call
            </Button>
          )}
          {canAct && row.status === 'CALLED' && (
            <Button
              size="sm"
              icon={<Play size={16} aria-hidden="true" />}
              loading={busy}
              onClick={() => onAct('start')}
            >
              Start
            </Button>
          )}
          {canAct && row.status === 'IN_SERVICE' && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Check size={16} aria-hidden="true" />}
              loading={busy}
              onClick={() => onAct('complete')}
            >
              Finish visit
            </Button>
          )}
          {canAct && row.status === 'SKIPPED' && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowUUpLeft size={16} aria-hidden="true" />}
              loading={busy}
              onClick={() => onMove(row.station)}
            >
              Back in line
            </Button>
          )}
          {canAct && (row.status === 'WAITING' || row.status === 'CALLED') && (
            <Button
              size="sm"
              variant="ghost"
              icon={<SkipForward size={16} aria-hidden="true" />}
              disabled={busy}
              onClick={() => onAct('skip')}
            >
              Stepped away
            </Button>
          )}
          {showOpen && row.status !== 'SKIPPED' && (
            <Link
              href={work.href}
              className="px-2 text-[13px] font-medium text-primary hover:text-primary-hover"
            >
              {work.label}
            </Link>
          )}

          {canAct && row.status !== 'COMPLETED' && (
            <label className={compact ? 'w-full' : 'ml-auto'}>
              <span className="sr-only">Send {name} to another desk</span>
              <select
                value=""
                disabled={busy}
                onChange={(e) => e.target.value && onMove(e.target.value as QueueStationKey)}
                className={`h-9 cursor-pointer rounded-control border border-control bg-surface px-2 text-[13px] font-medium text-fg ${compact ? 'w-full' : ''}`}
              >
                <option value="">Send to…</option>
                <optgroup label="Usually next">
                  {suggested.map((s) => (
                    <option key={s} value={s}>
                      {STATION_LABEL[s]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Other desks">
                  {others.map((s) => (
                    <option key={s} value={s}>
                      {STATION_LABEL[s]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}
        </div>
      )}
    </article>
  );
}
