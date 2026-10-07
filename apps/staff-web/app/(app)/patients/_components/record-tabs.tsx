'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowSquareOut,
  ArrowsLeftRight,
  Bandaids,
  CalendarBlank,
  CalendarCheck,
  ClipboardText,
  ClockCounterClockwise,
  File,
  FirstAid,
  Flask,
  Heartbeat,
  NotePencil,
  Package,
  Pill,
  Plus,
  Receipt,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Badge, StatusBadge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { DataTable, type Column } from '../../../../components/ui/data-table';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatMoney, formatTime, fullName, humanize } from '../../../../lib/format';
import { invalidProps, req, requiredProps, type FieldErrors } from '../../../../lib/forms';
import { can } from '../../../../lib/permissions';
import { useApi } from '../../../../lib/use-api';
import type { StaffRole } from '@serenemed/types';
import type { HistoryEntry } from './patient-banner';
import { openDocument, uploadDocument, type DocumentRow } from './document-files';
import { apiMessage, type PatientDetail } from './patient-shared';

export type TabKey =
  | 'overview'
  | 'timeline'
  | 'referrals'
  | 'care-plans'
  | 'follow-ups'
  | 'dispensing'
  | 'invoices'
  | 'insurance'
  | 'documents'
  | 'consent';

/** Each tab and the permission its endpoint needs. A role without it never sees the tab. */
export function visibleTabs(role: StaffRole | undefined): { key: TabKey; label: string }[] {
  const all: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'timeline', label: 'Timeline', show: can(role, 'patient-record:read-clinical') },
    { key: 'referrals', label: 'Referrals', show: can(role, 'patient-record:read-clinical') },
    { key: 'care-plans', label: 'Care plans', show: can(role, 'follow-up:manage') },
    { key: 'follow-ups', label: 'Follow-ups', show: can(role, 'follow-up:manage') },
    { key: 'dispensing', label: 'Dispensing', show: can(role, 'pharmacy:dispense') },
    { key: 'invoices', label: 'Invoices', show: can(role, 'invoice:manage') },
    { key: 'insurance', label: 'Insurance', show: can(role, 'insurance:manage') },
    { key: 'documents', label: 'Documents', show: can(role, 'patient:read') },
    { key: 'consent', label: 'Consent', show: can(role, 'patient:read') },
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
    case 'timeline':
      return <TimelineTab patientId={patientId} />;
    case 'documents':
      return <DocumentsTab patientId={patientId} role={role} />;
    case 'consent':
      return <ConsentTab patientId={patientId} role={role} />;
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

/* ---------- timeline ---------- */

type TimelineKind =
  | 'appointment'
  | 'visit'
  | 'vitals'
  | 'note'
  | 'diagnosis'
  | 'prescription'
  | 'lab_order'
  | 'lab_result'
  | 'procedure'
  | 'referral'
  | 'dispensing'
  | 'invoice'
  | 'payment'
  | 'follow_up'
  | 'document'
  | 'consent'
  | 'history';

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail?: string;
  status?: string;
  entityType: string;
  entityId: string;
  encounterId?: string | null;
}

const KIND_ICON: Record<TimelineKind, Icon> = {
  appointment: CalendarBlank,
  visit: Stethoscope,
  vitals: Heartbeat,
  note: NotePencil,
  diagnosis: FirstAid,
  prescription: Pill,
  lab_order: Flask,
  lab_result: Flask,
  procedure: Syringe,
  referral: ArrowSquareOut,
  dispensing: Package,
  invoice: Receipt,
  payment: Receipt,
  follow_up: CalendarCheck,
  document: File,
  consent: ShieldCheck,
  history: ClipboardText,
};

type TimelineFilter = 'all' | 'clinical' | 'tests' | 'medicines' | 'money' | 'admin';

const FILTER_KINDS: Record<Exclude<TimelineFilter, 'all'>, TimelineKind[]> = {
  clinical: ['visit', 'vitals', 'note', 'diagnosis', 'procedure', 'referral', 'history'],
  tests: ['lab_order', 'lab_result'],
  medicines: ['prescription', 'dispensing'],
  money: ['invoice', 'payment'],
  admin: ['appointment', 'follow_up', 'document', 'consent'],
};

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'clinical', label: 'Clinical' },
  { key: 'tests', label: 'Tests' },
  { key: 'medicines', label: 'Medicines' },
  { key: 'money', label: 'Money' },
  { key: 'admin', label: 'Admin' },
];

const GOOD = ['COMPLETED', 'PAID', 'FINALIZED', 'DONE', 'HANDED_OVER', 'DELIVERED', 'GRANTED'];
const BAD = ['CANCELLED', 'NO_SHOW', 'MISSED', 'VOID', 'REVOKED', 'SKIPPED', 'ENTERED_IN_ERROR'];
const OPEN = ['DRAFT', 'AI_DRAFT', 'PENDING', 'ESCALATED', 'PARTIALLY_PAID', 'PREPARED', 'ORDERED'];

function timelineTone(status: string) {
  if (GOOD.includes(status)) return 'success' as const;
  if (BAD.includes(status)) return 'danger' as const;
  if (OPEN.includes(status)) return 'warning' as const;
  return 'info' as const;
}

/** Clinic-local calendar day, for grouping. */
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

function TimelineTab({ patientId }: { patientId: string }) {
  const { data, loading, errorStatus, reload } = useApi<TimelineEntry[]>(
    `/patients/${encodeURIComponent(patientId)}/timeline`,
  );
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const entries = (data ?? []).filter(
    (e) => filter === 'all' || FILTER_KINDS[filter].includes(e.kind),
  );
  const days: { day: string; items: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.at);
    const last = days[days.length - 1];
    if (last && last.day === key) last.items.push(entry);
    else days.push({ day: key, items: [entry] });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={`h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary-subtle text-primary-subtle-fg'
                    : 'border-control bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        {data && (
          <span className="tabular text-[13px] text-fg-subtle">
            {entries.length} of {data.length} entries
          </span>
        )}
      </div>

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
      ) : loading ? (
        <div className="flex flex-col gap-4 px-6 py-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </div>
      ) : days.length === 0 ? (
        <EmptyState
          icon={ClockCounterClockwise}
          title={filter === 'all' ? 'Nothing on the timeline yet' : 'Nothing in this view'}
          description={
            filter === 'all'
              ? 'Appointments, visits, results, medicines and bills appear here as they happen.'
              : 'Choose another filter, or show everything.'
          }
          action={
            filter !== 'all' ? (
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Show everything
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="px-6 py-5">
          {days.map((group) => (
            <li key={group.day} className="mb-6 last:mb-0">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {formatDate(`${group.day}T12:00:00+05:30`)}
              </h3>
              <ol className="relative ml-4 border-l border-line pl-6">
                {group.items.map((entry) => {
                  const KindIcon = KIND_ICON[entry.kind] ?? ClipboardText;
                  return (
                    <li key={entry.id} className="relative pb-5 last:pb-0">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[37px] top-0 flex size-7 items-center justify-center rounded-full border border-line bg-surface text-fg-muted"
                      >
                        <KindIcon size={15} />
                      </span>
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                            {entry.title}
                            {entry.status && (
                              <Badge tone={timelineTone(entry.status)}>
                                {humanize(entry.status)}
                              </Badge>
                            )}
                          </p>
                          {entry.detail && (
                            <p className="mt-0.5 text-[13px] text-fg-muted">{entry.detail}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-[13px]">
                          {entry.encounterId && (
                            <Link
                              href={`/encounters/${entry.encounterId}`}
                              className="font-medium text-primary hover:text-primary-hover"
                            >
                              Open visit
                            </Link>
                          )}
                          <span className="tabular text-fg-subtle">{formatTime(entry.at)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ---------- documents ---------- */

const DOCUMENT_TYPES = [
  'PHOTO',
  'ID_PROOF',
  'INSURANCE_CARD',
  'PAN_CARD',
  'CONSENT_FORM',
  'OTHER',
] as const;

const DOCUMENT_LABEL: Record<string, string> = {
  PHOTO: 'Photo',
  ID_PROOF: 'ID proof',
  INSURANCE_CARD: 'Insurance card',
  PAN_CARD: 'PAN card',
  CONSENT_FORM: 'Consent form',
  OTHER: 'Other',
};

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm';
const ACCEPTED_TYPES = ACCEPT.split(',');
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function fileKind(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'JPEG image',
    'image/png': 'PNG image',
    'image/webp': 'WebP image',
    'application/pdf': 'PDF',
    'video/mp4': 'MP4 video',
    'video/webm': 'WebM video',
  };
  return map[mimeType] ?? mimeType;
}

function DocumentsTab({ patientId, role }: { patientId: string; role: StaffRole | undefined }) {
  const { data, loading, errorStatus, reload } = useApi<DocumentRow[]>(
    `/patient-documents/patient/${encodeURIComponent(patientId)}`,
  );
  const canWrite = can(role, 'patient:write');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<DocumentRow>();
  const [openError, setOpenError] = useState<string>();
  const [openingId, setOpeningId] = useState<string>();

  const open = async (doc: DocumentRow) => {
    setOpenError(undefined);
    setOpeningId(doc.id);
    try {
      await openDocument(doc.id);
    } catch (e) {
      setOpenError(apiMessage(e, `${doc.fileName} could not be opened.`));
    } finally {
      setOpeningId(undefined);
    }
  };

  const columns: Column<DocumentRow>[] = [
    {
      header: 'Type',
      render: (d) => (
        <span className="font-medium">
          {DOCUMENT_LABEL[d.documentType] ?? humanize(d.documentType)}
        </span>
      ),
    },
    {
      header: 'File',
      render: (d) => (
        <button
          type="button"
          onClick={() => open(d)}
          disabled={openingId === d.id}
          className="inline-flex max-w-xs cursor-pointer items-center gap-1.5 text-left font-medium text-primary hover:text-primary-hover disabled:opacity-60"
        >
          <span className="truncate">{d.fileName}</span>
          <ArrowSquareOut size={14} aria-hidden="true" className="shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </button>
      ),
    },
    {
      header: 'Kind',
      render: (d) => <span className="text-fg-muted">{fileKind(d.mimeType)}</span>,
    },
    { header: 'Added', render: (d) => <span className="tabular">{formatDate(d.createdAt)}</span> },
    { header: 'By', render: (d) => d.uploadedBy?.fullName ?? muted('Unknown') },
    ...(canWrite
      ? [
          {
            header: 'Action',
            align: 'right' as const,
            render: (d: DocumentRow) => (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash size={16} aria-hidden="true" />}
                onClick={() => setRemoving(d)}
              >
                Remove
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader
        title="Documents"
        description="Photos, ID proof, insurance cards and signed forms kept with this record."
        action={
          canWrite ? (
            <Button
              size="sm"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => setAdding(true)}
            >
              Add document
            </Button>
          ) : undefined
        }
      />
      {openError && (
        <p
          role="alert"
          className="mx-6 mt-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {openError}
        </p>
      )}
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
          getRowKey={(d) => d.id}
          loading={loading}
          empty={
            <EmptyState
              icon={File}
              title="No documents yet"
              description="Add a photo, ID proof, insurance card or signed form."
              action={
                canWrite ? (
                  <Button
                    icon={<Plus size={16} aria-hidden="true" />}
                    onClick={() => setAdding(true)}
                  >
                    Add document
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      {adding && (
        <AddDocumentDialog
          patientId={patientId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {removing && (
        <RemoveDocumentDialog
          doc={removing}
          onClose={() => setRemoving(undefined)}
          onRemoved={() => {
            setRemoving(undefined);
            reload();
          }}
        />
      )}
    </Card>
  );
}

function AddDocumentDialog({
  patientId,
  onClose,
  onAdded,
}: {
  patientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [type, setType] = useState<string>('ID_PROOF');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next: FieldErrors = {};
    if (!type) next['doc-type'] = 'Choose a document type.';
    if (!file) next['doc-file'] = 'Choose a file.';
    else if (!ACCEPTED_TYPES.includes(file.type))
      next['doc-file'] = 'Use a JPEG, PNG, WebP, PDF, MP4 or WebM file.';
    else if (file.size > MAX_UPLOAD_BYTES) next['doc-file'] = 'The file must be 25 MB or smaller.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      window.setTimeout(() => document.getElementById(Object.keys(next)[0]!)?.focus(), 0);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await uploadDocument({ patientId, documentType: type, file: file! });
      onAdded();
    } catch (e) {
      setError(apiMessage(e, 'The document could not be uploaded. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Add document"
      description="The file is stored with the patient's record."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="doc-form" loading={busy}>
            Upload
          </Button>
        </>
      }
    >
      <form id="doc-form" noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field label={req('Document type')} htmlFor="doc-type" error={errors['doc-type']}>
          <Select
            id="doc-type"
            value={type}
            {...requiredProps}
            {...invalidProps(errors['doc-type'])}
            onChange={(e) => {
              setType(e.target.value);
              setErrors((prev) => ({ ...prev, 'doc-type': undefined }));
              setError(undefined);
            }}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={req('File')}
          htmlFor="doc-file"
          helper={
            type === 'PHOTO'
              ? 'JPEG, PNG or WebP up to 25 MB. On a phone or tablet this opens the camera.'
              : 'JPEG, PNG, WebP, PDF, MP4 or WebM, up to 25 MB.'
          }
          error={errors['doc-file']}
        >
          <Input
            id="doc-file"
            type="file"
            accept={type === 'PHOTO' ? 'image/jpeg,image/png,image/webp' : ACCEPT}
            capture={type === 'PHOTO' ? 'environment' : undefined}
            {...requiredProps}
            {...invalidProps(errors['doc-file'])}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setErrors((prev) => ({ ...prev, 'doc-file': undefined }));
              setError(undefined);
            }}
            className="h-auto cursor-pointer py-2 file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg"
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function RemoveDocumentDialog({
  doc,
  onClose,
  onRemoved,
}: {
  doc: DocumentRow;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/patient-documents/${encodeURIComponent(doc.id)}/remove`);
      onRemoved();
    } catch (e) {
      setError(apiMessage(e, 'The document could not be removed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Remove document"
      description={doc.fileName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            Remove
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        This takes the {DOCUMENT_LABEL[doc.documentType]?.toLowerCase() ?? 'document'} off the
        patient&apos;s record. The audit log keeps a note of who removed it.
      </p>
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

/* ---------- consent ---------- */

const CONSENT_TYPES = [
  'TREATMENT',
  'DATA_SHARING',
  'AI_CONSULT_RECORDING',
  'MARKETING_COMMUNICATION',
] as const;
type ConsentType = (typeof CONSENT_TYPES)[number];

const CONSENT_LABEL: Record<ConsentType, string> = {
  TREATMENT: 'Treatment',
  DATA_SHARING: 'Data sharing',
  AI_CONSULT_RECORDING: 'AI consultation recording',
  MARKETING_COMMUNICATION: 'Marketing communication',
};

const CONSENT_HINT: Record<ConsentType, string> = {
  TREATMENT: 'Agreed to be examined and treated at this clinic.',
  DATA_SHARING: 'Agreed to records being shared with referred doctors and insurers.',
  AI_CONSULT_RECORDING: 'Agreed to consultations being recorded for the AI note assistant.',
  MARKETING_COMMUNICATION: 'Agreed to receive offers and campaign messages.',
};

interface ConsentEntry {
  id: string;
  consentType: ConsentType;
  action: 'GRANTED' | 'REVOKED';
  createdAt: string;
  recordedBy?: { fullName: string } | null;
  recordedById?: string;
}

interface ConsentState {
  history: ConsentEntry[];
  current: Partial<Record<ConsentType, 'GRANTED' | 'REVOKED'>>;
}

function ConsentTab({ patientId, role }: { patientId: string; role: StaffRole | undefined }) {
  const { data, loading, errorStatus, reload } = useApi<ConsentState>(
    `/patient-consent/patient/${encodeURIComponent(patientId)}`,
  );
  const canWrite = can(role, 'patient:write');
  const [recording, setRecording] = useState<ConsentType | 'any'>();

  // Latest entry per type, for its date.
  const latest = new Map<ConsentType, ConsentEntry>();
  for (const entry of data?.history ?? []) latest.set(entry.consentType, entry);
  const history = [...(data?.history ?? [])].reverse();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Current consent"
          description="The latest answer recorded for each kind of consent."
          action={
            canWrite ? (
              <Button
                size="sm"
                icon={<Plus size={16} aria-hidden="true" />}
                onClick={() => setRecording('any')}
              >
                Record consent
              </Button>
            ) : undefined
          }
        />
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
        ) : loading ? (
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            {CONSENT_TYPES.map((t) => (
              <Skeleton key={t} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            {CONSENT_TYPES.map((type) => {
              const state = data?.current[type];
              const entry = latest.get(type);
              return (
                <li
                  key={type}
                  className="flex flex-col gap-2 rounded-control border border-line bg-surface-muted/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-fg">{CONSENT_LABEL[type]}</p>
                      <p className="mt-0.5 text-[13px] text-fg-muted">{CONSENT_HINT[type]}</p>
                    </div>
                    <Badge
                      tone={
                        state === 'GRANTED' ? 'success' : state === 'REVOKED' ? 'danger' : 'neutral'
                      }
                    >
                      {state === 'GRANTED'
                        ? 'Given'
                        : state === 'REVOKED'
                          ? 'Withdrawn'
                          : 'Not recorded'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[13px] text-fg-subtle">
                    <span className="tabular">
                      {entry
                        ? `${formatDate(entry.createdAt)}, ${formatTime(entry.createdAt)}${entry.recordedBy ? ` by ${entry.recordedBy.fullName}` : ''}`
                        : 'Nothing recorded yet'}
                    </span>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => setRecording(type)}
                        className="cursor-pointer font-medium text-primary hover:text-primary-hover"
                      >
                        {state ? 'Update' : 'Record'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {data && history.length > 0 && (
        <Card>
          <CardHeader title="History" description="Every answer ever recorded, newest first." />
          <ul className="divide-y divide-line">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3 text-sm"
              >
                <span className="tabular w-40 shrink-0 text-fg-muted">
                  {formatDate(entry.createdAt)}, {formatTime(entry.createdAt)}
                </span>
                <span className="font-medium text-fg">{CONSENT_LABEL[entry.consentType]}</span>
                <Badge tone={entry.action === 'GRANTED' ? 'success' : 'danger'}>
                  {entry.action === 'GRANTED' ? 'Given' : 'Withdrawn'}
                </Badge>
                {entry.recordedBy && (
                  <span className="text-fg-subtle">by {entry.recordedBy.fullName}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recording && (
        <RecordConsentDialog
          patientId={patientId}
          initialType={recording === 'any' ? 'TREATMENT' : recording}
          onClose={() => setRecording(undefined)}
          onRecorded={() => {
            setRecording(undefined);
            reload();
          }}
        />
      )}
    </div>
  );
}

function RecordConsentDialog({
  patientId,
  initialType,
  onClose,
  onRecorded,
}: {
  patientId: string;
  initialType: ConsentType;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [type, setType] = useState<ConsentType>(initialType);
  const [action, setAction] = useState<'GRANTED' | 'REVOKED'>('GRANTED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post('/patient-consent', { patientId, consentType: type, action });
      onRecorded();
    } catch (e) {
      setError(apiMessage(e, 'The consent could not be recorded. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Record consent"
      description="What the patient has told you, as of now."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="consent-form" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="consent-form" noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field label={req('Consent for')} htmlFor="consent-type">
          <Select
            id="consent-type"
            value={type}
            {...requiredProps}
            onChange={(e) => {
              setType(e.target.value as ConsentType);
              setError(undefined);
            }}
          >
            {CONSENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONSENT_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-3 rounded-control bg-surface-muted px-4 py-4">
          <legend className="sr-only">Answer</legend>
          {(
            [
              ['GRANTED', 'Given', 'The patient agrees.'],
              ['REVOKED', 'Withdrawn', 'The patient no longer agrees, or has said no.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="consent-action"
                value={value}
                checked={action === value}
                onChange={() => {
                  setAction(value);
                  setError(undefined);
                }}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
              />
              <span className="text-sm text-fg">
                <span className="font-medium">{label}</span>
                <span className="block text-[13px] text-fg-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-[13px] text-fg-subtle">
          Every answer is kept. Recording a new one never deletes the earlier ones.
        </p>
        {error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
