'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CheckSquare, Plus } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { Tabs } from '../../../components/ui/tabs';
import { apiClient } from '../../../lib/api-client';
import { fullName, humanize } from '../../../lib/format';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { dueLabel, isPending, type TaskRow } from './_components/helpers';
import { NewTaskDialog } from './_components/new-task-dialog';

type TabKey = 'assigned' | 'created' | 'overdue' | 'done';

const PATHS: Record<TabKey, string> = {
  assigned: '/tasks',
  created: '/tasks?createdByMe=true',
  overdue: '/tasks?due=overdue',
  done: '/tasks?status=DONE',
};

const EMPTY: Record<TabKey, { title: string; description: string }> = {
  assigned: {
    title: 'Nothing to do',
    description: 'Tasks assigned to you, and reminders you add for yourself, appear here.',
  },
  created: {
    title: 'You have not created any tasks',
    description: 'Tasks and reminders you create appear here.',
  },
  overdue: {
    title: 'Nothing is overdue',
    description: 'Open tasks past their due time appear here.',
  },
  done: {
    title: 'No finished tasks yet',
    description: 'Tasks you complete are kept here.',
  },
};

export default function TasksPage() {
  const user = useStaff();
  const [tab, setTab] = useState<TabKey>('assigned');
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();

  const assigned = useApi<TaskRow[]>(PATHS.assigned);
  const created = useApi<TaskRow[]>(PATHS.created);
  const overdue = useApi<TaskRow[]>(PATHS.overdue);
  const finished = useApi<TaskRow[]>(PATHS.done);
  const directory = useApi<{ id: string; fullName: string; role: string }[]>('/users/directory');
  const sources = { assigned, created, overdue, done: finished };
  const active = sources[tab];

  const reloadAll = () => {
    assigned.reload();
    created.reload();
    overdue.reload();
    finished.reload();
  };

  const rows = useMemo(() => {
    const data = active.data;
    if (!data) return undefined;
    if (tab === 'assigned') return data.filter((t) => isPending(t.status));
    if (tab === 'created') return data.filter((t) => t.status !== 'CANCELLED');
    return data;
  }, [active.data, tab]);

  const complete = async (task: TaskRow) => {
    setError(undefined);
    setDone((prev) => new Set(prev).add(task.id));
    try {
      await apiClient.post(`/tasks/${task.id}/status`, { status: 'DONE' });
      reloadAll();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'That task has already changed. The list has been refreshed.'
          : 'That did not go through. The task is still open.',
      );
      reloadAll();
    } finally {
      setDone((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const count = (state: typeof assigned, pendingOnly: boolean) =>
    state.data
      ? (pendingOnly ? state.data.filter((t) => isPending(t.status)) : state.data).length
      : undefined;

  const empty = EMPTY[tab];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Your to-do list and reminders."
        action={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            New task
          </Button>
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {error}
        </p>
      )}

      <Card>
        <div className="px-5">
          <Tabs<TabKey>
            label="Task lists"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'assigned', label: 'Assigned to me', count: count(assigned, true) },
              { key: 'created', label: 'Created by me' },
              { key: 'overdue', label: 'Overdue', count: count(overdue, false) },
              { key: 'done', label: 'Done' },
            ]}
          />
        </div>

        {active.errorStatus !== undefined && !active.loading ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-fg-muted">
              {active.errorMessage ?? 'This could not be loaded.'}
            </p>
            <Button variant="secondary" onClick={active.reload}>
              Try again
            </Button>
          </div>
        ) : active.loading ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={empty.title}
            description={empty.description}
            action={
              tab === 'assigned' || tab === 'created' ? (
                <Button
                  variant="secondary"
                  icon={<Plus size={18} aria-hidden="true" />}
                  onClick={() => setCreating(true)}
                >
                  New task
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul>
            {rows?.map((task) => {
              const checked = done.has(task.id) || task.status === 'DONE';
              const canComplete = isPending(task.status) && !done.has(task.id);
              const due = task.dueAt ? dueLabel(task.dueAt, task.status, now) : undefined;
              const strike = checked || task.status === 'CANCELLED';
              return (
                <li
                  key={task.id}
                  className="flex items-start gap-3 border-b border-line px-5 py-3 last:border-0"
                >
                  <button
                    type="button"
                    aria-label={`Mark done: ${task.title}`}
                    aria-pressed={checked}
                    disabled={!canComplete}
                    onClick={() => complete(task)}
                    className={`mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-control border transition-colors disabled:cursor-default ${
                      checked
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-control bg-surface hover:border-primary'
                    }`}
                  >
                    {checked && <Check size={14} weight="bold" aria-hidden="true" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${strike ? 'text-fg-subtle line-through' : 'text-fg'}`}
                    >
                      {task.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-fg-muted">
                      {due && (
                        <span className={due.overdue ? 'font-medium text-danger-fg' : ''}>
                          {due.text}
                        </span>
                      )}
                      {task.patient && <span>{fullName(task.patient)}</span>}
                      {tab === 'created' && task.assignee.id !== user.id && (
                        <span>For {task.assignee.fullName}</span>
                      )}
                      {tab === 'assigned' && task.createdBy.id !== user.id && (
                        <span>From {task.createdBy.fullName}</span>
                      )}
                      {task.status === 'IN_PROGRESS' && <span>In progress</span>}
                    </p>
                  </div>
                  <Badge
                    tone={
                      task.priority === 'URGENT'
                        ? 'danger'
                        : task.priority === 'HIGH'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {humanize(task.priority)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <NewTaskDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={reloadAll}
        staff={(directory.data ?? []).filter((u) => u.id !== user.id)}
        canPickPatient={can(user.role, 'patient:read')}
      />
    </>
  );
}
