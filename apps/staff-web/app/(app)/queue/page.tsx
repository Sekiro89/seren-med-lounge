'use client';

import { useState } from 'react';
import { ListNumbers, Megaphone, Play, Check, SkipForward } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/badge';
import { Skeleton } from '../../../components/ui/skeleton';
import { apiClient } from '../../../lib/api-client';
import { fullName, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';

interface QueueRow {
  id: string;
  tokenNumber: number;
  station: string;
  status: string;
  patient: { firstName: string; lastName: string };
}

const STATIONS = [
  'VITALS',
  'JUNIOR_DOCTOR',
  'SENIOR_DOCTOR',
  'BILLING',
  'PHARMACY',
  'LAB',
] as const;

type Action = 'call' | 'start' | 'complete' | 'skip';

/**
 * Live board of today's tokens, one column per station. Refreshes every
 * 10 seconds. Completed tokens drop off the board; skipped ones stay so
 * the desk can move them back into line.
 */
export default function QueuePage() {
  const user = useStaff();
  const allowed = can(user.role, 'queue:manage');
  const { data, loading, reload } = useApi<QueueRow[]>(allowed ? '/queue' : null, 10_000);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const act = async (id: string, path: string, body?: unknown) => {
    setBusyId(id);
    setError(undefined);
    try {
      await apiClient.post(`/queue/${id}/${path}`, body);
      reload();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'That token has already moved on. The board has been refreshed.'
          : 'That did not go through. Please try again.',
      );
      reload();
    } finally {
      setBusyId(undefined);
    }
  };

  const open = (data ?? []).filter((e) => e.status !== 'COMPLETED');

  return (
    <>
      <PageHeader
        title="Queue"
        description="Today's patients by station. The board refreshes on its own."
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {error}
        </p>
      )}

      {!loading && open.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListNumbers}
            title="Nobody is waiting"
            description="Tokens appear here when a checked-in patient is registered at the front desk."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STATIONS.map((station) => {
            const entries = open.filter((e) => e.station === station);
            return (
              <section
                key={station}
                aria-label={humanize(station)}
                className="rounded-panel border border-line bg-surface-muted p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-fg">{humanize(station)}</h2>
                  <span className="tabular rounded-full bg-surface px-2 py-0.5 font-mono text-xs font-medium text-fg-muted">
                    {entries.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {loading && <Skeleton className="h-24 w-full" />}
                  {!loading && entries.length === 0 && (
                    <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">No one here</p>
                  )}
                  {entries.map((entry) => (
                    <TokenCard
                      key={entry.id}
                      entry={entry}
                      busy={busyId === entry.id}
                      onAct={(action: Action) => act(entry.id, action)}
                      onMove={(to) => act(entry.id, 'move', { station: to })}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function TokenCard({
  entry,
  busy,
  onAct,
  onMove,
}: {
  entry: QueueRow;
  busy: boolean;
  onAct: (action: Action) => void;
  onMove: (station: string) => void;
}) {
  return (
    <article className="rounded-control border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <span className="tabular font-mono text-xl font-semibold text-fg">
            {String(entry.tokenNumber).padStart(3, '0')}
          </span>
          <span className="text-sm font-medium text-fg">{fullName(entry.patient)}</span>
        </div>
        <StatusBadge domain="queue" status={entry.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {entry.status === 'WAITING' && (
          <Button
            size="sm"
            icon={<Megaphone size={16} aria-hidden="true" />}
            loading={busy}
            onClick={() => onAct('call')}
          >
            Call
          </Button>
        )}
        {(entry.status === 'WAITING' || entry.status === 'CALLED') && (
          <Button
            size="sm"
            variant={entry.status === 'CALLED' ? 'primary' : 'secondary'}
            icon={<Play size={16} aria-hidden="true" />}
            disabled={busy}
            onClick={() => onAct('start')}
          >
            Start
          </Button>
        )}
        {entry.status === 'IN_SERVICE' && (
          <Button
            size="sm"
            icon={<Check size={16} aria-hidden="true" />}
            loading={busy}
            onClick={() => onAct('complete')}
          >
            Complete
          </Button>
        )}
        {(entry.status === 'WAITING' || entry.status === 'CALLED') && (
          <Button
            size="sm"
            variant="ghost"
            icon={<SkipForward size={16} aria-hidden="true" />}
            disabled={busy}
            onClick={() => onAct('skip')}
          >
            Skip
          </Button>
        )}

        <label className="ml-auto">
          <span className="sr-only">Move {fullName(entry.patient)} to another station</span>
          <select
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && onMove(e.target.value)}
            className="h-8 cursor-pointer rounded-control border border-control bg-surface px-2 text-[13px] text-fg-muted"
          >
            <option value="">Move to</option>
            {STATIONS.filter((s) => s !== entry.station).map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}
