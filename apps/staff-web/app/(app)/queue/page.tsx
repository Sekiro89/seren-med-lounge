'use client';

import { useState } from 'react';
import { ListNumbers, Megaphone } from '@phosphor-icons/react';
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
import { Figures, InkFilters, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { Skeleton } from '../../../components/ui/skeleton';
import { apiClient } from '../../../lib/api-client';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import {
  STATION_LABEL,
  formatToken,
  formatWait,
  waitTone,
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

  const waitingCount = active.filter((r) => r.status === 'WAITING').length;
  const steppedAway = rows.filter((r) => r.status === 'SKIPPED');
  const finished = rows.filter((r) => r.status === 'COMPLETED').length;

  return (
    <InkSheet>
      <SheetHead
        eyebrow="Today"
        title="Queue"
        description={
          view === 'desk'
            ? 'Patients waiting for you, next one first. Hand them on with "Send to" when you are done.'
            : 'Every patient in the clinic today and the desk they are waiting at.'
        }
        figures={
          <Figures
            loading={loading && !data}
            items={[
              { label: 'In the clinic', value: active.length },
              { label: 'Waiting', value: waitingCount },
              {
                label: 'Longest wait',
                value: !longest
                  ? 'None'
                  : longest < 60
                    ? longest
                    : `${Math.floor(longest / 60)} h ${String(longest % 60).padStart(2, '0')}`,
                unit: longest ? 'min' : undefined,
                tone: longest >= 40 ? 'danger' : longest >= 20 ? 'warning' : undefined,
              },
              { label: 'Stepped away', value: steppedAway.length },
              { label: 'Finished', value: finished },
            ]}
          />
        }
      />

      {((manages && hasDesk) || (view === 'desk' && servesDoctorDesk)) && (
        <SheetBar
          actions={
            view === 'desk' && servesDoctorDesk ? (
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-fg">
                <input
                  type="checkbox"
                  checked={mineOnly}
                  onChange={(e) => setMineOnly(e.target.checked)}
                  className="size-4 cursor-pointer accent-primary"
                />
                Only patients booked with me (and unassigned ones)
              </label>
            ) : undefined
          }
        >
          {manages && hasDesk && (
            <InkFilters<View>
              label="Queue view"
              value={view}
              onChange={setView}
              options={[
                { key: 'desk', label: 'My desk' },
                { key: 'board', label: 'Whole clinic', count: active.length },
              ]}
            />
          )}
        </SheetBar>
      )}

      {error && (
        <p
          role="alert"
          className="mx-5 mt-5 rounded-control bg-danger-bg px-4 py-3 text-sm text-danger-fg sm:mx-8"
        >
          {error}
        </p>
      )}

      {view === 'desk' ? (
        <div className="flex flex-col gap-10 px-5 pb-8 pt-6 sm:px-8">
          {served.map((station, i) => {
            const mine = (r: QueueRow) => {
              if (!mineOnly || !DOCTOR_STATIONS.includes(station)) return true;
              const doctorId = r.encounter?.appointment?.doctor?.id;
              return !doctorId || doctorId === user.id;
            };
            const here = rows.filter((r) => r.station === station && mine(r));
            return (
              <DeskSection
                key={station}
                number={served.length > 1 ? i + 1 : undefined}
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
        <EmptyState
          icon={ListNumbers}
          title="Nobody in the queue yet"
          description="Patients get a token when the front desk checks them in from Appointments."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {QUEUE_STATIONS.map((station) => {
              const here = active.filter((r) => r.station === station).sort(byNextUp);
              const waitingHere = here.filter((r) => r.status === 'WAITING');
              const longestHere = waitingHere.reduce(
                (max, r) => Math.max(max, minutesWaiting(r, now)),
                0,
              );
              return (
                <section
                  key={station}
                  aria-label={STATION_LABEL[station]}
                  className="border-b border-line px-5 pb-6 pt-5 md:border-r md:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r-0 sm:px-6"
                >
                  <div className="section-rule mb-4 flex items-end justify-between gap-3 pt-2">
                    <div>
                      <h2 className="text-sm font-semibold text-fg">{STATION_LABEL[station]}</h2>
                      <p className="mt-0.5 text-[12px] text-fg-muted">
                        {waitingHere.length === 0 ? (
                          'Nobody waiting'
                        ) : (
                          <>
                            Longest wait{' '}
                            <span className={`tabular font-mono ${waitTone(longestHere)}`}>
                              {formatWait(longestHere)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <p className="text-right">
                      <span className="block text-[11px] text-fg-muted">At this desk</span>
                      <span className="tabular block font-mono text-[28px] leading-none text-fg">
                        {loading && !data ? '-' : here.length}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {loading && !data && <Skeleton className="h-28 w-full" />}
                    {!loading && here.length === 0 && (
                      <p className="border border-dashed border-line py-8 text-center text-[13px] text-fg-subtle">
                        Nobody waiting
                      </p>
                    )}
                    {here.map(card)}
                  </div>
                </section>
              );
            })}
          </div>
          {steppedAway.length > 0 && (
            <div className="px-5 pb-6 sm:px-8">
              <SteppedAway rows={steppedAway} renderCard={card} />
            </div>
          )}
        </>
      )}
    </InkSheet>
  );
}

function DeskSection({
  number,
  station,
  rows,
  now,
  loading,
  busyId,
  onCallNext,
  renderCard,
}: {
  number?: number;
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
  const longest = next ? minutesWaiting(next, now) : 0;

  return (
    <section aria-label={STATION_LABEL[station]}>
      <div className="section-rule mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pt-3">
        <h2 className="text-base font-semibold text-fg">
          {number !== undefined && (
            <span className="tabular mr-2 font-mono text-fg-subtle" aria-hidden="true">
              {number}.
            </span>
          )}
          {STATION_LABEL[station]}
        </h2>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Figures
            size="sm"
            loading={loading}
            items={[
              { label: 'Waiting', value: waiting.length },
              {
                label: 'Longest wait',
                value: next ? formatWait(longest) : 'None',
                tone: longest >= 40 ? 'danger' : longest >= 20 ? 'warning' : undefined,
              },
            ]}
          />
          {next && (
            <Button
              icon={<Megaphone size={18} aria-hidden="true" />}
              loading={busyId === next.id}
              onClick={() => onCallNext(next)}
            >
              Call next: <span className="tabular font-mono">{formatToken(next.tokenNumber)}</span>
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-28 w-full" />
      ) : ordered.length === 0 ? (
        <div className="border border-dashed border-line">
          <EmptyState
            icon={ListNumbers}
            title="Nobody waiting here"
            description={
              station === 'VITALS'
                ? 'Patients appear here when the front desk checks them in.'
                : 'Patients appear here when another desk sends them to you.'
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{ordered.map(renderCard)}</div>
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
    <details className="mt-5 border-t border-line pt-3">
      <summary className="cursor-pointer text-[13px] font-medium text-fg">
        Stepped away <span className="tabular font-mono text-fg-muted">{rows.length}</span>
      </summary>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{rows.map(renderCard)}</div>
    </details>
  );
}
