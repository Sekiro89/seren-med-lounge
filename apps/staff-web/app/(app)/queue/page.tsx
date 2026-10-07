'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Clock,
  ListNumbers,
  Megaphone,
  PersonSimpleWalk,
  Users,
} from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import {
  QUEUE_STATIONS,
  canActAtStation,
  managesWholeQueue,
  stationsServedBy,
  type Permission,
  type QueueStationKey,
} from '@serenemed/permissions';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { KpiTile } from '../../../components/ui/kpi-tile';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { Tabs } from '../../../components/ui/tabs';
import { apiClient } from '../../../lib/api-client';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import {
  STATION_ICON,
  STATION_LABEL,
  WaitTime,
  formatToken,
  minutesWaiting,
  useNow,
  type QueueRow,
} from './_components/shared';
import { TokenCard, type QueueAction } from './_components/token-card';

type View = 'desk' | 'board';

/** What a role needs to open the page where a station's work is done. */
const OPEN_PERMISSION: Record<QueueStationKey, Permission[]> = {
  VITALS: ['patient-record:read-clinical'],
  JUNIOR_DOCTOR: ['patient-record:read-clinical'],
  SENIOR_DOCTOR: ['patient-record:read-clinical'],
  LAB: ['lab-order:write', 'lab-result:write'],
  BILLING: ['invoice:manage'],
  PHARMACY: ['pharmacy:dispense'],
};

const DOCTOR_STATIONS: QueueStationKey[] = ['JUNIOR_DOCTOR', 'SENIOR_DOCTOR'];

/** In service first, then called, then waiting longest first. */
const ORDER = { IN_SERVICE: 0, CALLED: 1, WAITING: 2, SKIPPED: 3, COMPLETED: 4 } as const;
const byNextUp = (a: QueueRow, b: QueueRow) =>
  ORDER[a.status] - ORDER[b.status] || a.waitingSince.localeCompare(b.waitingSince);

/**
 * Today's tokens. A token follows the patient through the visit (vitals,
 * doctor, lab, billing, pharmacy), so every desk the patient passes
 * through sees them here:
 *
 * - My desk: the stations this role works at, next patient first, with
 *   Call next, a link to where the work is done, and "Send to" to hand
 *   the patient on.
 * - Whole clinic (front desk and administrators): every station at once,
 *   with wait times, so a backed-up desk is visible at a glance.
 */
export default function QueuePage() {
  const user = useStaff();
  const served = stationsServedBy(user.role);
  const manages = managesWholeQueue(user.role);
  const allowed = manages || served.length > 0;
  const hasDesk = served.length > 0 && served.length < QUEUE_STATIONS.length;

  const [view, setView] = useState<View>(hasDesk ? 'desk' : 'board');
  const [mineOnly, setMineOnly] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const now = useNow();
  const { data, loading, reload } = useApi<QueueRow[]>(allowed ? '/queue' : null, 10_000);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const run = async (id: string, path: string, body?: unknown) => {
    setBusyId(id);
    setError(undefined);
    try {
      await apiClient.post(`/queue/${id}/${path}`, body);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'That token has already moved on. The list has been refreshed.'
          : e instanceof ApiError && e.status === 403
            ? 'That patient is waiting at a desk you do not work at.'
            : 'That did not go through. Please try again.',
      );
    } finally {
      reload();
      setBusyId(undefined);
    }
  };
  const act = (row: QueueRow, action: QueueAction) => run(row.id, action);
  const move = (row: QueueRow, station: QueueStationKey) => run(row.id, 'move', { station });

  const rows = data ?? [];
  const active = rows.filter((r) => r.status !== 'COMPLETED' && r.status !== 'SKIPPED');
  const longest = active
    .filter((r) => r.status === 'WAITING')
    .reduce((max, r) => Math.max(max, minutesWaiting(r, now)), 0);
  const servesDoctorDesk = served.some((s) => DOCTOR_STATIONS.includes(s));

  const card = (row: QueueRow) => (
    <TokenCard
      compact={view === 'board'}
      key={row.id}
      row={row}
      now={now}
      busy={busyId === row.id}
      canAct={canActAtStation(user.role, row.station)}
      showOpen={OPEN_PERMISSION[row.station].some((p) => can(user.role, p))}
      onAct={(action) => act(row, action)}
      onMove={(station) => move(row, station)}
    />
  );

  return (
    <>
      <PageHeader
        title="Queue"
        description={
          view === 'desk'
            ? 'Patients waiting for you, next one first. Hand them on with "Send to" when you are done.'
            : 'Every patient in the clinic today and the desk they are waiting at.'
        }
      />

      {manages && hasDesk && (
        <div className="mb-6">
          <Tabs
            label="Queue view"
            value={view}
            onChange={setView}
            tabs={[
              { key: 'desk', label: 'My desk' },
              { key: 'board', label: 'Whole clinic', count: active.length },
            ]}
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-control bg-danger-bg px-4 py-3 text-sm text-danger-fg"
        >
          {error}
        </p>
      )}

      {view === 'board' && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="In the clinic now"
            value={active.length}
            hint="Waiting or being seen"
            icon={Users}
            loading={loading}
          />
          <KpiTile
            label="Longest wait"
            value={longest ? `${longest} min` : 'None'}
            hint="At their current desk"
            icon={Clock}
            tone={longest >= 40 ? 'danger' : longest >= 20 ? 'warning' : 'info'}
            loading={loading}
          />
          <KpiTile
            label="Stepped away"
            value={rows.filter((r) => r.status === 'SKIPPED').length}
            hint="Put back in line when they return"
            icon={PersonSimpleWalk}
            tone="warning"
            loading={loading}
          />
          <KpiTile
            label="Finished today"
            value={rows.filter((r) => r.status === 'COMPLETED').length}
            hint="Visits completed"
            icon={CheckCircle}
            tone="success"
            loading={loading}
          />
        </div>
      )}

      {view === 'desk' ? (
        <div className="flex flex-col gap-8">
          {servesDoctorDesk && (
            <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-fg">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)}
                className="size-5 cursor-pointer accent-primary"
              />
              Only patients booked with me (and unassigned ones)
            </label>
          )}
          {served.map((station) => {
            const mine = (r: QueueRow) => {
              if (!mineOnly || !DOCTOR_STATIONS.includes(station)) return true;
              const doctorId = r.encounter?.appointment?.doctor?.id;
              return !doctorId || doctorId === user.id;
            };
            const here = rows.filter((r) => r.station === station && mine(r));
            return (
              <DeskSection
                key={station}
                station={station}
                rows={here}
                now={now}
                loading={loading}
                busyId={busyId}
                onCallNext={(row) => act(row, 'call')}
                renderCard={card}
              />
            );
          })}
        </div>
      ) : !loading && rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListNumbers}
            title="Nobody in the queue yet"
            description="Patients get a token when the front desk checks them in from Appointments."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {QUEUE_STATIONS.map((station) => {
            const here = active.filter((r) => r.station === station).sort(byNextUp);
            const StationIcon = STATION_ICON[station];
            return (
              <section
                key={station}
                aria-label={STATION_LABEL[station]}
                className="rounded-panel border border-line bg-surface-muted/60 p-4"
              >
                <div className="mb-4 flex items-center justify-between px-1">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <StationIcon size={18} className="text-primary" aria-hidden="true" />
                    {STATION_LABEL[station]}
                  </h2>
                  <span className="tabular rounded-control bg-surface px-2.5 py-0.5 font-mono text-xs font-medium text-fg-muted">
                    {here.length}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {loading && <Skeleton className="h-28 w-full" />}
                  {!loading && here.length === 0 && (
                    <p className="px-1 py-8 text-center text-[13px] text-fg-subtle">
                      Nobody waiting
                    </p>
                  )}
                  {here.map(card)}
                </div>
              </section>
            );
          })}
          <SteppedAway rows={rows.filter((r) => r.status === 'SKIPPED')} renderCard={card} />
        </div>
      )}
    </>
  );
}

function DeskSection({
  station,
  rows,
  now,
  loading,
  busyId,
  onCallNext,
  renderCard,
}: {
  station: QueueStationKey;
  rows: QueueRow[];
  now: number;
  loading: boolean;
  busyId: string | undefined;
  onCallNext: (row: QueueRow) => void;
  renderCard: (row: QueueRow) => React.ReactNode;
}) {
  const active = rows.filter((r) => r.status !== 'COMPLETED' && r.status !== 'SKIPPED');
  const ordered = [...active].sort(byNextUp);
  const waiting = ordered.filter((r) => r.status === 'WAITING');
  const next = waiting[0];
  const StationIcon = STATION_ICON[station];

  return (
    <section aria-label={STATION_LABEL[station]}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <StationIcon size={20} className="text-primary" aria-hidden="true" />
            {STATION_LABEL[station]}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {waiting.length === 0 ? (
              'Nobody waiting'
            ) : (
              <>
                {waiting.length} waiting · longest{' '}
                <WaitTime minutes={minutesWaiting(waiting[0]!, now)} />
              </>
            )}
          </p>
        </div>
        {next && (
          <Button
            icon={<Megaphone size={18} aria-hidden="true" />}
            loading={busyId === next.id}
            onClick={() => onCallNext(next)}
          >
            Call next: {formatToken(next.tokenNumber)}
          </Button>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-28 w-full" />
      ) : ordered.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListNumbers}
            title="Nobody waiting here"
            description={
              station === 'VITALS'
                ? 'Patients appear here when the front desk checks them in.'
                : 'Patients appear here when another desk sends them to you.'
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{ordered.map(renderCard)}</div>
      )}

      <SteppedAway rows={rows.filter((r) => r.status === 'SKIPPED')} renderCard={renderCard} />
    </section>
  );
}

function SteppedAway({
  rows,
  renderCard,
}: {
  rows: QueueRow[];
  renderCard: (row: QueueRow) => React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="col-span-full mt-4 rounded-panel border border-line bg-surface px-5 py-4">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        Stepped away ({rows.length})
      </summary>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{rows.map(renderCard)}</div>
    </details>
  );
}
