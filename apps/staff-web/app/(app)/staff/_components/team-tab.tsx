'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DotsThree, Eye, EyeSlash, UserPlus, UsersThree, Warning } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { StaffRole } from '@serenemed/types';
import { createUserSchema, type CreateUserInput } from '@serenemed/validation';
import { PersonCell } from '../../../../components/ui/avatar';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { DataTable, type Column } from '../../../../components/ui/data-table';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { Toolbar } from '../../../../components/ui/toolbar';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, humanize } from '../../../../lib/format';
import type { ApiState } from '../../../../lib/use-api';

export interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = Object.values(StaffRole);

function serverMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body?.message.join(' ') : body?.message;
    return message ?? 'That could not be saved. Please try again.';
  }
  return 'Could not reach the server. Please try again.';
}

type Action = { kind: 'role'; person: StaffRow } | { kind: 'status'; person: StaffRow } | null;

export function TeamTab({
  team,
  currentUserId,
}: {
  team: ApiState<StaffRow[]>;
  currentUserId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const addButton = (
    <Button icon={<UserPlus size={20} aria-hidden="true" />} onClick={() => setAdding(true)}>
      Add staff
    </Button>
  );

  const columns: Column<StaffRow>[] = [
    { header: 'Name', render: (u) => <PersonCell name={u.fullName} sub={u.email} /> },
    { header: 'Role', render: (u) => <Badge tone="info">{humanize(u.role)}</Badge> },
    {
      header: 'Status',
      render: (u) =>
        u.isActive ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="neutral">Switched off</Badge>
        ),
    },
    { header: 'Added', render: (u) => <span className="tabular">{formatDate(u.createdAt)}</span> },
    {
      header: 'Actions',
      align: 'right',
      render: (u) =>
        u.id === currentUserId ? (
          <span className="text-sm text-fg-subtle">You</span>
        ) : (
          <div className="relative inline-block text-left">
            <button
              type="button"
              aria-label={`Actions for ${u.fullName}`}
              aria-haspopup="menu"
              aria-expanded={menuFor === u.id}
              onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMenuFor(null);
              }}
              className="flex size-10 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg"
            >
              <DotsThree size={22} weight="bold" aria-hidden="true" />
            </button>
            {menuFor === u.id && (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1 w-44 rounded-control border border-line bg-surface py-1 shadow-popover"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setMenuFor(null);
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full cursor-pointer px-4 py-2 text-left text-sm text-fg hover:bg-surface-muted"
                  onClick={() => {
                    setMenuFor(null);
                    setAction({ kind: 'role', person: u });
                  }}
                >
                  Change role
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full cursor-pointer px-4 py-2 text-left text-sm text-fg hover:bg-surface-muted"
                  onClick={() => {
                    setMenuFor(null);
                    setAction({ kind: 'status', person: u });
                  }}
                >
                  {u.isActive ? 'Switch off' : 'Switch on'}
                </button>
              </div>
            )}
          </div>
        ),
    },
  ];

  return (
    <Card>
      <Toolbar actions={addButton}>
        <p className="text-sm text-fg-muted">
          Switching someone off or changing their role ends their open sessions.
        </p>
      </Toolbar>
      {team.errorStatus !== undefined && !team.loading ? (
        <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <Warning size={24} className="text-danger-fg" aria-hidden="true" />
          <p className="text-sm text-fg-muted">The team could not be loaded.</p>
          <Button variant="secondary" onClick={team.reload}>
            Try again
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={team.data}
          getRowKey={(u) => u.id}
          loading={team.loading}
          empty={
            <EmptyState
              icon={UsersThree}
              title="No staff yet"
              description="Add the first person so they can sign in."
              action={addButton}
            />
          }
        />
      )}

      <AddStaffDialog
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          team.reload();
        }}
      />
      {action?.kind === 'role' && (
        <ChangeRoleDialog
          person={action.person}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            team.reload();
          }}
        />
      )}
      {action?.kind === 'status' && (
        <StatusDialog
          person={action.person}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            team.reload();
          }}
        />
      )}
    </Card>
  );
}

function AddStaffDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', fullName: '', password: '', role: StaffRole.RECEPTION },
  });

  function close() {
    reset();
    setServerError(undefined);
    setShowPassword(false);
    onClose();
  }

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      await apiClient.post('/users', values);
      reset();
      setShowPassword(false);
      onDone();
    } catch (error) {
      setServerError(serverMessage(error));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add staff"
      description="They sign in with this email and the temporary password."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={submit}>
            Add staff
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <Field
          label="Full name"
          htmlFor="staff-name"
          error={errors.fullName && 'Enter their full name.'}
        >
          <Input id="staff-name" autoComplete="off" {...register('fullName')} />
        </Field>
        <Field
          label="Email"
          htmlFor="staff-email"
          error={errors.email && 'Enter a valid email address.'}
        >
          <Input id="staff-email" type="email" autoComplete="off" {...register('email')} />
        </Field>
        <Field label="Role" htmlFor="staff-role" error={errors.role && 'Choose a role.'}>
          <Select id="staff-role" {...register('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Temporary password"
          htmlFor="staff-password"
          helper="At least 8 characters. Share it privately, never by group chat."
          error={errors.password && 'Use at least 8 characters.'}
        >
          <div className="relative">
            <Input
              id="staff-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="pr-12"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1 flex size-9 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg"
            >
              {showPassword ? (
                <EyeSlash size={20} aria-hidden="true" />
              ) : (
                <Eye size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </Field>
        {serverError && (
          <p role="alert" className="text-sm text-danger-fg">
            {serverError}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function ChangeRoleDialog({
  person,
  onClose,
  onDone,
}: {
  person: StaffRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState(person.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/users/${person.id}`, { role });
      onDone();
    } catch (e) {
      setError(serverMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change role for ${person.fullName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={role === person.role} onClick={save}>
            Change role
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Field label="Role" htmlFor="change-role">
          <Select id="change-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-fg-muted">
          The change applies immediately and ends {person.fullName}&apos;s open sessions, so they
          will need to sign in again.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function StatusDialog({
  person,
  onClose,
  onDone,
}: {
  person: StaffRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const switchingOff = person.isActive;
  const verb = switchingOff ? 'Switch off' : 'Switch on';

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/users/${person.id}`, { isActive: !switchingOff });
      onDone();
    } catch (e) {
      setError(serverMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${verb} ${person.fullName}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={switchingOff ? 'danger' : 'primary'} loading={busy} onClick={confirm}>
            {verb}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">
          {switchingOff
            ? `${person.fullName} will be signed out of every open session and will not be able to sign in until you switch them on again. Their past work stays on record.`
            : `${person.fullName} will be able to sign in again with their current password.`}
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
