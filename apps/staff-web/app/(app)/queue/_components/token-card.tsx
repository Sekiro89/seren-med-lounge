'use client';

import Link from 'next/link';
import { ArrowUUpLeft, Check, Megaphone, Play, SkipForward } from '@phosphor-icons/react';
import { QUEUE_STATIONS, type QueueStationKey } from '@serenemed/permissions';
import { Button } from '../../../../components/ui/button';
import { StatusBadge } from '../../../../components/ui/badge';
import { fullName } from '../../../../lib/format';
import {
  STATION_LABEL,
  SUGGESTED_NEXT,
  WaitTime,
  formatToken,
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

  return (
    <article className="rounded-control border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="tabular flex h-11 min-w-14 items-center justify-center rounded-control bg-primary-subtle px-2 font-mono text-lg font-semibold text-primary-subtle-fg">
          {formatToken(row.tokenNumber)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-fg">{name}</p>
            <StatusBadge domain="queue" status={row.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-muted">
            <span>{row.status === 'WAITING' ? 'Waiting' : 'At this desk'}</span>
            <WaitTime minutes={minutesWaiting(row, now)} />
            {doctor && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{doctor}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {(canAct || showOpen) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
