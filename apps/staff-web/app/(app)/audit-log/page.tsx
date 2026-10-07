'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClockCounterClockwise, Warning } from '@phosphor-icons/react';
import { apiClient } from '../../../lib/api-client';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { type Column } from '../../../components/ui/data-table';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { Select } from '../../../components/ui/fields';
import { NoAccess } from '../../../components/ui/no-access';
import { Figures, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { RuledTable } from '../../../components/ui/ruled-table';
import { formatDate, formatTime, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { AREAS, describeAction, formatMetaValue, labelKey } from './_components/actions';

interface AuditEntry {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
}

interface AuditPage {
  items: AuditEntry[];
  hasMore: boolean;
}

interface DirectoryUser {
  id: string;
  fullName: string;
  role: string;
}

const PAGE_SIZE = 50;

function actorLabel(entry: AuditEntry): { name: string; sub?: string } {
  if (entry.actorName) {
    return { name: entry.actorName, sub: entry.actorRole ? humanize(entry.actorRole) : undefined };
  }
  const type = entry.actorType.toUpperCase();
  return { name: type === 'PATIENT' ? 'Patient' : 'System' };
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : 'None';
}

export default function AuditLogPage() {
  const user = useStaff();
  const allowed = can(user.role, 'audit-log:read');
  const directory = useApi<DirectoryUser[]>(allowed ? '/users/directory' : null);

  const [prefix, setPrefix] = useState('');
  const [actorId, setActorId] = useState('');
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const query = useCallback(
    (before?: string) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (prefix) params.set('action', prefix);
      if (actorId) params.set('actorId', actorId);
      if (before) params.set('before', before);
      return `/audit/search?${params.toString()}`;
    },
    [prefix, actorId],
  );

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    apiClient
      .get<AuditPage>(query())
      .then((page) => {
        if (cancelled) return;
        setRows(page.items);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, query, retry]);

  function changeFilter(set: (value: string) => void, value: string) {
    setLoading(true);
    setFailed(false);
    set(value);
  }

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await apiClient.get<AuditPage>(query(last.createdAt));
      setRows((current) => [...current, ...page.items]);
      setHasMore(page.hasMore);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const columns: Column<AuditEntry>[] = [
    {
      header: 'When',
      render: (e) => (
        <button
          type="button"
          onClick={() => setSelected(e)}
          className="tabular cursor-pointer whitespace-nowrap text-left font-mono text-fg hover:text-primary"
        >
          {formatDate(e.createdAt)} <span className="text-fg-muted">{formatTime(e.createdAt)}</span>
        </button>
      ),
    },
    {
      header: 'Person',
      render: (e) => {
        const a = actorLabel(e);
        return (
          <span className="block min-w-0">
            <span className="block truncate">{a.name}</span>
            {a.sub && <span className="block truncate text-[12px] text-fg-muted">{a.sub}</span>}
          </span>
        );
      },
    },
    { header: 'What happened', render: (e) => describeAction(e.action) },
    {
      header: 'Record',
      render: (e) => (
        <span>
          {humanize(e.entityType)}
          <span className="tabular ml-2 font-mono text-[12px] text-fg-subtle">
            {shortId(e.entityId)}
          </span>
        </span>
      ),
    },
  ];

  const detail = selected;

  return (
    <>
      <InkSheet>
        <SheetHead
          title="Audit log"
          description="Who did what, and when. Entries cannot be edited or deleted."
          figures={
            <Figures
              loading={loading}
              items={[
                {
                  label: 'Entries loaded',
                  value: rows.length,
                  unit: hasMore ? '+' : undefined,
                },
                {
                  label: 'People',
                  value: new Set(rows.map((r) => r.actorId ?? r.actorType)).size,
                },
                {
                  label: 'Oldest shown',
                  value:
                    rows.length > 0
                      ? formatDate(rows[rows.length - 1]!.createdAt).slice(0, 6)
                      : '-',
                },
              ]}
            />
          }
        />
        <SheetBar
          actions={
            <span className="text-[12px] text-fg-subtle">Select a time to see the full entry</span>
          }
        >
          <div className="w-52">
            <Select
              aria-label="Area"
              value={prefix}
              onChange={(e) => changeFilter(setPrefix, e.target.value)}
            >
              {AREAS.map((a) => (
                <option key={a.label} value={a.prefix}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-60">
            <Select
              aria-label="Staff member"
              value={actorId}
              onChange={(e) => changeFilter(setActorId, e.target.value)}
            >
              <option value="">Everyone</option>
              {directory.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </div>
        </SheetBar>

        {failed ? (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <Warning size={24} className="text-danger-fg" aria-hidden="true" />
            <p className="text-sm text-fg-muted">The audit log could not be loaded.</p>
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setFailed(false);
                setRetry((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <RuledTable
            caption="Audit entries"
            columns={columns}
            rows={rows}
            getRowKey={(e) => e.id}
            loading={loading}
            pageSize={500}
            onRowClick={(e) => setSelected(e)}
            empty={
              <EmptyState
                icon={ClockCounterClockwise}
                title="Nothing recorded here yet"
                description="Try another area or person, or choose all activity."
                action={
                  prefix || actorId ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLoading(true);
                        setPrefix('');
                        setActorId('');
                      }}
                    >
                      Show all activity
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}

        {!failed && !loading && hasMore && (
          <div className="flex flex-col items-center gap-2 px-6 py-5">
            {moreFailed && (
              <p role="alert" className="text-[13px] text-danger-fg">
                More entries could not be loaded.
              </p>
            )}
            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
              Load more
            </Button>
          </div>
        )}
      </InkSheet>

      <Dialog
        variant="drawer"
        open={detail !== null}
        onClose={() => setSelected(null)}
        title={detail ? describeAction(detail.action) : 'Entry'}
        description={
          detail ? `${formatDate(detail.createdAt)}, ${formatTime(detail.createdAt)}` : undefined
        }
      >
        {detail && (
          <div className="flex flex-col gap-6">
            <dl className="divide-y divide-line text-sm">
              <Row label="Person" value={actorLabel(detail).name} />
              {detail.actorRole && <Row label="Role" value={humanize(detail.actorRole)} />}
              <Row label="Action" value={detail.action} mono />
              <Row label="Record type" value={detail.entityType} mono />
              <Row label="Record id" value={detail.entityId ?? 'None'} mono />
            </dl>
            <div>
              <h3 className="mb-2 text-base font-semibold">Details</h3>
              {detail.metadata && Object.keys(detail.metadata).length > 0 ? (
                <dl className="divide-y divide-line text-sm">
                  {Object.entries(detail.metadata).map(([key, value]) => (
                    <Row key={key} label={labelKey(key)} value={formatMetaValue(value)} mono />
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-fg-muted">No extra details were recorded.</p>
              )}
            </div>
            <p className="text-[13px] text-fg-subtle">
              Details hold ids, statuses and field names only. They never hold clinical text,
              passwords or API keys.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-fg ${mono ? 'tabular font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
