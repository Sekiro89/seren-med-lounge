'use client';

import { useState, type ReactNode } from 'react';
import {
  Bandaids,
  CalendarCheck,
  ClipboardText,
  Receipt,
  ShieldCheck,
  Pill,
  ArrowsLeftRight,
  WarningCircle,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Badge, StatusBadge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { DataTable, type Column } from '../../../../components/ui/data-table';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatMoney, formatTime, fullName, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { useApi } from '../../../../lib/use-api';
import type { StaffRole } from '@serenemed/types';
import type { HistoryEntry } from './patient-banner';
import { apiMessage, type PatientDetail } from './patient-shared';

export type TabKey =
  'overview' | 'referrals' | 'care-plans' | 'follow-ups' | 'dispensing' | 'invoices' | 'insurance';

/** Each tab and the permission its endpoint needs. A role without it never sees the tab. */
export function visibleTabs(role: StaffRole | undefined): { key: TabKey; label: string }[] {
  const all: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'referrals', label: 'Referrals', show: can(role, 'patient-record:read-clinical') },
    { key: 'care-plans', label: 'Care plans', show: can(role, 'follow-up:manage') },
    { key: 'follow-ups', label: 'Follow-ups', show: can(role, 'follow-up:manage') },
    { key: 'dispensing', label: 'Dispensing', show: can(role, 'pharmacy:dispense') },
    { key: 'invoices', label: 'Invoices', show: can(role, 'invoice:manage') },
    { key: 'insurance', label: 'Insurance', show: can(role, 'insurance:manage') },
  ];
  return all.filter((t) => t.show).map(({ key, label }) => ({ key, label }));
}

export function TabPanel({
  tab,
  patientId,
  patient,
  role,
  history,
}: {
  tab: TabKey;
  patientId: string;
  patient: PatientDetail;
  role: StaffRole | undefined;
  history: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
}) {
  const id = encodeURIComponent(patientId);
  switch (tab) {
    case 'overview':
      return <Overview patientId={patientId} patient={patient} role={role} history={history} />;
    case 'referrals':
      return <ReferralsTab path={`/referrals?patientId=${id}`} />;
    case 'care-plans':
      return <CarePlansTab path={`/care-plans?patientId=${id}`} />;
    case 'follow-ups':
      return <FollowUpsTab path={`/follow-ups?patientId=${id}`} />;
    case 'dispensing':
      return <DispensingTab path={`/dispensings?patientId=${id}`} />;
    case 'invoices':
      return <InvoicesTab path={`/invoices?patientId=${id}`} />;
    case 'insurance':
      return <InsuranceTab path={`/insurance/policies?patientId=${id}`} />;
  }
}

/* ---------- generic list panel ---------- */

function ListPanel<T extends { id: string }>({
  path,
  columns,
  empty,
}: {
  path: string;
  columns: Column<T>[];
  empty: { icon: Icon; title: string; description: string };
}) {
  const { data, loading, errorStatus, reload } = useApi<T[]>(path);
  return (
    <Card>
      {errorStatus !== undefined && !loading ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <WarningCircle size={24} className="text-danger-fg" aria-hidden="true" />
          <p className="mt-3 text-sm text-fg">
            {errorStatus === 403 ? 'Your role cannot view this.' : 'This could not be loaded.'}
          </p>
          {errorStatus !== 403 && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={reload}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={data}
          getRowKey={(row) => row.id}
          loading={loading}
          empty={<EmptyState {...empty} />}
        />
      )}
    </Card>
  );
}

const muted = (text: ReactNode) => <span className="text-fg-subtle">{text}</span>;
const date = (iso: string | null | undefined) => (iso ? formatDate(iso) : muted('None'));

/* ---------- referrals ---------- */

interface ReferralRow {
  id: string;
  type: string;
  reason: string;
  urgency: string;
  status: string;
  toName: string | null;
  toFacility: string | null;
  toSpecialty: string | null;
  toUser: { fullName: string } | null;
  referredBy: { fullName: string };
  createdAt: string;
}

const REFERRAL_STATUS = { OPEN: 'info', COMPLETED: 'success', CANCELLED: 'neutral' } as const;

function ReferralsTab({ path }: { path: string }) {
  const columns: Column<ReferralRow>[] = [
    { header: 'Date', render: (r) => <span className="tabular">{formatDate(r.createdAt)}</span> },
    {
      header: 'Referred to',
      render: (r) => (
        <span className="leading-tight">
          <span className="block font-medium">
            {r.toUser?.fullName ?? r.toName ?? r.toSpecialty ?? humanize(r.type)}
          </span>
          {r.toFacility && <span className="block text-xs text-fg-subtle">{r.toFacility}</span>}
        </span>
      ),
    },
    { header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-sm">{r.reason}</span> },
    {
      header: 'Urgency',
      render: (r) => (
        <Badge
          tone={r.urgency === 'ROUTINE' ? 'neutral' : r.urgency === 'URGENT' ? 'warning' : 'danger'}
        >
          {humanize(r.urgency)}
        </Badge>
      ),
    },
    { header: 'By', render: (r) => r.referredBy.fullName },
    {
      header: 'Status',
      render: (r) => (
        <Badge tone={REFERRAL_STATUS[r.status as keyof typeof REFERRAL_STATUS] ?? 'neutral'}>
          {humanize(r.status)}
        </Badge>
      ),
    },
  ];
  return (
    <ListPanel
      path={path}
      columns={columns}
      empty={{
        icon: ArrowsLeftRight,
        title: 'No referrals',
        description: 'Referrals made during visits appear here.',
      }}
    />
  );
}

/* ---------- care plans ---------- */

interface CarePlanRow {
  id: string;
  title: string;
  status: string;
  dischargeInstructions: string | null;
  createdAt: string;
  followUps: { id: string; status: string }[];
}

const PLAN_TONE = { ACTIVE: 'info', COMPLETED: 'success', CANCELLED: 'neutral' } as const;

function CarePlansTab({ path }: { path: string }) {
  const columns: Column<CarePlanRow>[] = [
    {
      header: 'Started',
      render: (c) => <span className="tabular">{formatDate(c.createdAt)}</span>,
    },
    { header: 'Plan', render: (c) => <span className="font-medium">{c.title}</span> },
    {
      header: 'Instructions',
      render: (c) =>
        c.dischargeInstructions ? (
          <span className="line-clamp-2 max-w-sm text-fg-muted">{c.dischargeInstructions}</span>
        ) : (
          muted('None')
        ),
    },
    {
      header: 'Follow-ups',
      render: (c) => {
        const open = c.followUps.filter((f) => f.status === 'PENDING' || f.status === 'ESCALATED');
        return (
          <span className="tabular">
            {open.length} open of {c.followUps.length}
          </span>
        );
      },
    },
    {
      header: 'Status',
      render: (c) => (
        <Badge tone={PLAN_TONE[c.status as keyof typeof PLAN_TONE] ?? 'neutral'}>
          {humanize(c.status)}
        </Badge>
      ),
    },
  ];
  return (
    <ListPanel
      path={path}
      columns={columns}
      empty={{
        icon: ClipboardText,
        title: 'No care plans',
        description: 'Plans written at discharge appear here with their follow-ups.',
      }}
    />
  );
}

/* ---------- follow-ups ---------- */

interface FollowUpRow {
  id: string;
  type: string;
  dueAt: string;
  status: string;
  notes: string | null;
  outcome: string | null;
  assignedTo: { fullName: string } | null;
}

function FollowUpsTab({ path }: { path: string }) {
  const columns: Column<FollowUpRow>[] = [
    { header: 'Due', render: (f) => <span className="tabular">{formatDate(f.dueAt)}</span> },
    { header: 'Type', render: (f) => <span className="font-medium">{humanize(f.type)}</span> },
    {
      header: 'Notes',
      render: (f) =>
        (f.outcome ?? f.notes) ? (
          <span className="line-clamp-2 max-w-sm">{f.outcome ?? f.notes}</span>
        ) : (
          muted('None')
        ),
    },
    {
      header: 'Assigned to',
      render: (f) => f.assignedTo?.fullName ?? muted('Unassigned'),
    },
    { header: 'Status', render: (f) => <StatusBadge domain="followUp" status={f.status} /> },
  ];
  return (
    <ListPanel
      path={path}
      columns={columns}
      empty={{
        icon: CalendarCheck,
        title: 'No follow-ups',
        description: 'Reminders and review visits for this patient appear here.',
      }}
    />
  );
}

/* ---------- dispensing ---------- */

interface DispensingRow {
  id: string;
  quantity: number;
  status: string;
  mode: string;
  createdAt: string;
  medication: { name: string; strength: string | null; unit: string | null };
}

const DISPENSING_TONE = {
  PREPARED: 'warning',
  HANDED_OVER: 'success',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
} as const;

function DispensingTab({ path }: { path: string }) {
  const columns: Column<DispensingRow>[] = [
    { header: 'Date', render: (d) => <span className="tabular">{formatDate(d.createdAt)}</span> },
    {
      header: 'Medication',
      render: (d) => (
        <span className="font-medium">
          {d.medication.name}
          {d.medication.strength ? ` ${d.medication.strength}` : ''}
        </span>
      ),
    },
    { header: 'Quantity', align: 'right', render: (d) => d.quantity },
    { header: 'Fulfilment', render: (d) => humanize(d.mode) },
    {
      header: 'Status',
      render: (d) => (
        <Badge tone={DISPENSING_TONE[d.status as keyof typeof DISPENSING_TONE] ?? 'neutral'}>
          {humanize(d.status)}
        </Badge>
      ),
    },
  ];
  return (
    <ListPanel
      path={path}
      columns={columns}
      empty={{
        icon: Pill,
        title: 'Nothing dispensed',
        description: 'Medication handed over or delivered appears here.',
      }}
    />
  );
}

/* ---------- invoices ---------- */

interface InvoiceRow {
  id: string;
  number: number;
  status: string;
  totalMinor: number;
  paidMinor: number;
  createdAt: string;
}

function InvoicesTab({ path }: { path: string }) {
  const columns: Column<InvoiceRow>[] = [
    {
      header: 'Invoice',
      render: (i) => <span className="tabular font-mono font-medium">#{i.number}</span>,
    },
    { header: 'Date', render: (i) => <span className="tabular">{formatDate(i.createdAt)}</span> },
    { header: 'Status', render: (i) => <StatusBadge domain="invoice" status={i.status} /> },
    { header: 'Total', align: 'right', render: (i) => formatMoney(i.totalMinor) },
    { header: 'Paid', align: 'right', render: (i) => formatMoney(i.paidMinor) },
    {
      header: 'Balance',
      align: 'right',
      render: (i) => (
        <span className="font-medium">
          {i.status === 'VOID' ? muted('Void') : formatMoney(i.totalMinor - i.paidMinor)}
        </span>
      ),
    },
  ];
  return (
    <ListPanel
      path={path}
      columns={columns}
      empty={{
        icon: Receipt,
        title: 'No invoices',
        description: 'Invoices issued to this patient appear here.',
      }}
    />
  );
}

/* ---------- insurance ---------- */

interface PolicyRow {
  id: string;
  insurerName: string;
  tpaName: string | null;
  policyNumber: string;
  memberId: string | null;
  sumInsuredMinor: number | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
}

function InsuranceTab({ path }: { path: string }) {
  const columns: Column<PolicyRow>[] = [
    {
      header: 'Insurer',
      render: (p) => (
        <span className="leading-tight">
          <span className="block font-medium">{p.insurerName}</span>
          {p.tpaName && <span className="block text-xs text-fg-subtle">{p.tpaName}</span>}
        </span>
      ),
    },
    {
      header: 'Policy number',
      render: (p) => <span className="tabular font-mono">{p.policyNumber}</span>,
    },
    {
      header: 'Valid',
      render: (p) =>
        p.validFrom || p.validTo ? (
          <span className="tabular">
            {date(p.validFrom)} to {date(p.validTo)}
          </span>
        ) : (
          muted('Not set')
        ),
    },
    {
      header: 'Sum insured',
      align: 'right',
      render: (p) =>
        p.sumInsuredMinor === null ? muted('Not set') : formatMoney(p.sumInsuredMinor),
    },
    {
      header: 'Status',
      render: (p) => (
        <Badge tone={p.isActive ? 'success' : 'neutral'}>
          {p.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];
  return (
    <ListPanel
      path={path}
      columns={columns}
      empty={{
        icon: ShieldCheck,
        title: 'No insurance policies',
        description: 'Policies recorded for this patient appear here.',
      }}
    />
  );
}

/* ---------- overview ---------- */

const CATEGORY_ORDER = [
  'ALLERGY',
  'CONDITION',
  'CURRENT_MEDICATION',
  'PAST_SURGERY',
  'FAMILY_HISTORY',
  'SOCIAL_HISTORY',
];

function Overview({
  patientId,
  patient,
  role,
  history,
}: {
  patientId: string;
  patient: PatientDetail;
  role: StaffRole | undefined;
  history: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
}) {
  const canClinical = can(role, 'patient-record:read-clinical');
  const canActivate = can(role, 'patient:write');
  const [activating, setActivating] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card>
        <CardHeader
          title="Contact"
          action={
            canActivate && !patient.hasAccount ? (
              <Button variant="secondary" size="sm" onClick={() => setActivating(true)}>
                Send account activation
              </Button>
            ) : undefined
          }
        />
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 px-5 py-5 text-sm">
          <dt className="text-fg-muted">Phone</dt>
          <dd className="tabular text-fg">{patient.phone}</dd>
          <dt className="text-fg-muted">Email</dt>
          <dd className="text-fg">{patient.email ?? muted('Not given')}</dd>
          <dt className="text-fg-muted">Date of birth</dt>
          <dd className="tabular text-fg">{formatDate(patient.dateOfBirth)}</dd>
          <dt className="text-fg-muted">Registered</dt>
          <dd className="tabular text-fg">{formatDate(patient.createdAt)}</dd>
          <dt className="text-fg-muted">Patient portal</dt>
          <dd>
            <Badge tone={patient.hasAccount ? 'success' : 'neutral'}>
              {patient.hasAccount ? 'Account active' : 'No account yet'}
            </Badge>
          </dd>
        </dl>
      </Card>

      {canClinical && (
        <Card>
          <CardHeader
            title="Medical history"
            description="Active entries recorded by clinicians."
          />
          <HistoryList history={history} />
        </Card>
      )}

      {activating && (
        <ActivationDialog
          patientId={patientId}
          name={fullName(patient)}
          onClose={() => setActivating(false)}
        />
      )}
    </div>
  );
}

function HistoryList({
  history,
}: {
  history: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
}) {
  if (history.loading) return <p className="px-5 py-5 text-sm text-fg-muted">Loading history</p>;
  if (history.failed)
    return <p className="px-5 py-5 text-sm text-danger-fg">Medical history could not be loaded.</p>;
  const active = (history.entries ?? []).filter((e) => e.status === 'ACTIVE');
  if (active.length === 0)
    return (
      <EmptyState
        icon={Bandaids}
        title="No history recorded"
        description="Allergies, conditions and medication are added during visits."
      />
    );
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: active.filter((e) => e.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="divide-y divide-line">
      {groups.map((group) => (
        <div key={group.category} className="px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {humanize(group.category)}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {group.items.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-fg">{e.description}</span>
                {e.severity && (
                  <Badge tone={e.severity === 'MILD' ? 'neutral' : 'danger'}>
                    {humanize(e.severity)}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ---------- activation ---------- */

type ActivationResult =
  { kind: 'created'; code: string; expiresAt: string } | { kind: 'duplicate_account' };

function ActivationDialog({
  patientId,
  name,
  onClose,
}: {
  patientId: string;
  name: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ActivationResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await apiClient.post<ActivationResult>(`/patients/${patientId}/send-activation`));
    } catch (e) {
      setError(apiMessage(e, 'Could not create an activation code. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Send account activation"
      description={`For ${name}`}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} onClick={send}>
              Create activation code
            </Button>
          </>
        )
      }
    >
      {!result && (
        <p className="text-sm text-fg-muted">
          This creates a one-time code for the patient to set up their portal account. Nothing is
          sent to them: you read the code out in person.
        </p>
      )}
      {result?.kind === 'created' && (
        <div className="rounded-panel border border-line bg-surface-muted p-4">
          <p className="text-[13px] font-medium text-fg-muted">Activation code</p>
          <p
            className="tabular mt-1 select-all font-mono text-2xl font-semibold tracking-[0.2em] text-fg"
            aria-label={`Activation code ${result.code.split('').join(' ')}`}
          >
            {result.code}
          </p>
          <p className="mt-2 text-[13px] text-fg-muted">
            Read this out to the patient now. It is shown only once and expires on{' '}
            {formatDate(result.expiresAt)} at {formatTime(result.expiresAt)}.
          </p>
        </div>
      )}
      {result?.kind === 'duplicate_account' && (
        <p className="rounded-control bg-info-bg px-3 py-2 text-sm text-info-fg">
          This patient already has a portal account, so no code was issued.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {error}
        </p>
      )}
    </Dialog>
  );
}
