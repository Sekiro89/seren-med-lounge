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
import { Button } from '../../../../components/ui/button';
import { type Column } from '../../../../components/ui/data-table';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { InkFilters, InkSection, InkStatus, StatusWord } from '../../../../components/ui/ink';
import { RuledTable } from '../../../../components/ui/ruled-table';
import { MarginLabel, SheetRow } from '../../../../components/ui/sheet';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatMoney, formatTime, fullName, humanize } from '../../../../lib/format';
import { invalidProps, req, requiredProps, type FieldErrors } from '../../../../lib/forms';
import { can } from '../../../../lib/permissions';
import { useApi } from '../../../../lib/use-api';
import type { StaffRole } from '@serenemed/types';
import { RangeRuler, parseRange, parseValue, rangeFlag } from '../../encounters/[id]/document';
import type { LabOrderRow } from '../../labs/_components/types';
import type { HistoryEntry } from './patient-banner';
import { openDocument, uploadDocument, type DocumentRow } from './document-files';
import { apiMessage, formatPhone, sexWord, type PatientDetail } from './patient-shared';

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

/**
 * The body of the record under the letterhead and tabs. Overview is a set
 * of numbered ruled sections with margin notes, like the consultation;
 * every other tab is one ruled section on the same sheet.
 */
export function TabPanel({
  tab,
  patientId,
  patient,
  role,
  history,
  onTab,
}: {
  tab: TabKey;
  patientId: string;
  patient: PatientDetail;
  role: StaffRole | undefined;
  history: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
  /** Jump to another tab (the overview's "Full timeline"). */
  onTab: (tab: TabKey) => void;
}) {
  const id = encodeURIComponent(patientId);
  if (tab === 'overview') {
    return (
      <Overview
        patientId={patientId}
        patient={patient}
        role={role}
        history={history}
        onTab={onTab}
      />
    );
  }
  let body: ReactNode;
  switch (tab) {
    case 'referrals':
      body = <ReferralsTab path={`/referrals?patientId=${id}`} />;
      break;
    case 'care-plans':
      body = <CarePlansTab path={`/care-plans?patientId=${id}`} />;
      break;
    case 'follow-ups':
      body = <FollowUpsTab path={`/follow-ups?patientId=${id}`} />;
      break;
    case 'dispensing':
      body = <DispensingTab path={`/dispensings?patientId=${id}`} />;
      break;
    case 'invoices':
      body = <InvoicesTab path={`/invoices?patientId=${id}`} />;
      break;
    case 'insurance':
      body = <InsuranceTab path={`/insurance/policies?patientId=${id}`} />;
      break;
    case 'timeline':
      body = <TimelineTab patientId={patientId} />;
      break;
    case 'documents':
      body = <DocumentsTab patientId={patientId} role={role} />;
      break;
    case 'consent':
      body = <ConsentTab patientId={patientId} role={role} />;
      break;
  }
  return (
    <SheetRow last className="pt-5">
      {body}
    </SheetRow>
  );
}

/* ---------- shared pieces ---------- */

/** Lets a RuledTable (which insets its own first and last columns) sit flush in the sheet. */
function Flush({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 sm:-mx-10 sm:[&_td:first-child]:pl-10 sm:[&_td:last-child]:pr-10 sm:[&_th:first-child]:pl-10 sm:[&_th:last-child]:pr-10">
      {children}
    </div>
  );
}

function LoadError({ status, onRetry }: { status: number; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <WarningCircle size={24} className="text-danger-fg" aria-hidden="true" />
      <p className="mt-3 text-sm text-fg">
        {status === 403 ? 'Your role cannot view this.' : 'This could not be loaded.'}
      </p>
      {status !== 403 && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const countMeta = (n: number | undefined, one: string, many: string) =>
  n === undefined ? undefined : (
    <span className="tabular font-mono">
      {n} {n === 1 ? one : many}
    </span>
  );

/* ---------- generic list panel ---------- */

function ListPanel<T extends { id: string }>({
  title,
  noun,
  path,
  columns,
  empty,
}: {
  title: string;
  /** Singular and plural for the count after the title. */
  noun: [string, string];
  path: string;
  columns: Column<T>[];
  empty: { icon: Icon; title: string; description: string };
}) {
  const { data, loading, errorStatus, reload } = useApi<T[]>(path);
  return (
    <InkSection title={title} meta={countMeta(data?.length, noun[0], noun[1])}>
      {errorStatus !== undefined && !loading ? (
        <LoadError status={errorStatus} onRetry={reload} />
      ) : (
        <Flush>
          <RuledTable
            columns={columns}
            rows={data}
            getRowKey={(row) => row.id}
            loading={loading}
            minWidth={640}
            empty={<EmptyState {...empty} />}
          />
        </Flush>
      )}
    </InkSection>
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
    {
      header: 'Date',
      render: (r) => <span className="tabular font-mono">{formatDate(r.createdAt)}</span>,
    },
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
        <StatusWord
          tone={r.urgency === 'ROUTINE' ? 'neutral' : r.urgency === 'URGENT' ? 'warning' : 'danger'}
        >
          {humanize(r.urgency)}
        </StatusWord>
      ),
    },
    { header: 'By', render: (r) => r.referredBy.fullName },
    {
      header: 'Status',
      render: (r) => (
        <StatusWord tone={REFERRAL_STATUS[r.status as keyof typeof REFERRAL_STATUS] ?? 'neutral'}>
          {humanize(r.status)}
        </StatusWord>
      ),
    },
  ];
  return (
    <ListPanel
      title="Referrals"
      noun={['referral', 'referrals']}
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
      render: (c) => <span className="tabular font-mono">{formatDate(c.createdAt)}</span>,
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
          <span className="tabular font-mono">
            {open.length} open of {c.followUps.length}
          </span>
        );
      },
    },
    {
      header: 'Status',
      render: (c) => (
        <StatusWord tone={PLAN_TONE[c.status as keyof typeof PLAN_TONE] ?? 'neutral'}>
          {humanize(c.status)}
        </StatusWord>
      ),
    },
  ];
  return (
    <ListPanel
      title="Care plans"
      noun={['plan', 'plans']}
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
    {
      header: 'Due',
      render: (f) => <span className="tabular font-mono">{formatDate(f.dueAt)}</span>,
    },
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
    { header: 'Status', render: (f) => <InkStatus domain="followUp" status={f.status} /> },
  ];
  return (
    <ListPanel
      title="Follow-ups"
      noun={['follow-up', 'follow-ups']}
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
    {
      header: 'Date',
      render: (d) => <span className="tabular font-mono">{formatDate(d.createdAt)}</span>,
    },
    {
      header: 'Medication',
      render: (d) => (
        <span className="font-medium">
          {d.medication.name}
          {d.medication.strength ? ` ${d.medication.strength}` : ''}
        </span>
      ),
    },
    { header: 'Quantity', align: 'right', numeric: true, render: (d) => d.quantity },
    { header: 'Fulfilment', render: (d) => humanize(d.mode) },
    {
      header: 'Status',
      render: (d) => (
        <StatusWord tone={DISPENSING_TONE[d.status as keyof typeof DISPENSING_TONE] ?? 'neutral'}>
          {humanize(d.status)}
        </StatusWord>
      ),
    },
  ];
  return (
    <ListPanel
      title="Dispensing"
      noun={['item', 'items']}
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
    {
      header: 'Date',
      render: (i) => <span className="tabular font-mono">{formatDate(i.createdAt)}</span>,
    },
    { header: 'Status', render: (i) => <InkStatus domain="invoice" status={i.status} /> },
    { header: 'Total', align: 'right', numeric: true, render: (i) => formatMoney(i.totalMinor) },
    { header: 'Paid', align: 'right', numeric: true, render: (i) => formatMoney(i.paidMinor) },
    {
      header: 'Balance',
      align: 'right',
      numeric: true,
      render: (i) => (
        <span className="font-medium">
          {i.status === 'VOID' ? muted('Void') : formatMoney(i.totalMinor - i.paidMinor)}
        </span>
      ),
    },
  ];
  return (
    <ListPanel
      title="Invoices"
      noun={['invoice', 'invoices']}
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
          <span className="tabular font-mono">
            {date(p.validFrom)} to {date(p.validTo)}
          </span>
        ) : (
          muted('Not set')
        ),
    },
    {
      header: 'Sum insured',
      align: 'right',
      numeric: true,
      render: (p) =>
        p.sumInsuredMinor === null ? muted('Not set') : formatMoney(p.sumInsuredMinor),
    },
    {
      header: 'Status',
      render: (p) => (
        <StatusWord tone={p.isActive ? 'success' : 'neutral'}>
          {p.isActive ? 'Active' : 'Inactive'}
        </StatusWord>
      ),
    },
  ];
  return (
    <ListPanel
      title="Insurance"
      noun={['policy', 'policies']}
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

interface TimelineLite {
  id: string;
  kind: string;
  at: string;
  title: string;
  detail?: string;
  status?: string;
  encounterId?: string | null;
}

interface ResultLine {
  key: string;
  testName: string;
  value: string;
  unit: string | null;
  range: string | null;
  at: string;
  corrected: boolean;
}

/** The newest result of every test, newest first. */
function latestResults(orders: LabOrderRow[] | undefined): ResultLine[] | undefined {
  if (!orders) return undefined;
  const lines: ResultLine[] = [];
  for (const order of orders) {
    if (order.status === 'CANCELLED') continue;
    for (const item of order.items) {
      const newest = [...item.results].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!newest) continue;
      lines.push({
        key: item.id,
        testName: item.testName,
        value: newest.resultValue,
        unit: newest.unit,
        range: newest.referenceRange,
        at: newest.createdAt,
        corrected: item.results.length > 1,
      });
    }
  }
  lines.sort((a, b) => b.at.localeCompare(a.at));
  // One line per test name: the latest value wins.
  const seen = new Set<string>();
  return lines.filter((l) => {
    const k = l.testName.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function Overview({
  patientId,
  patient,
  role,
  history,
  onTab,
}: {
  patientId: string;
  patient: PatientDetail;
  role: StaffRole | undefined;
  history: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
  onTab: (tab: TabKey) => void;
}) {
  const canClinical = can(role, 'patient-record:read-clinical');
  const canActivate = can(role, 'patient:write');
  const [activating, setActivating] = useState(false);
  const id = encodeURIComponent(patientId);
  const labs = useApi<LabOrderRow[]>(canClinical ? `/lab-orders?patientId=${id}` : null);
  const timeline = useApi<TimelineLite[]>(canClinical ? `/patients/${id}/timeline` : null);

  const results = latestResults(labs.data);
  const visits = timeline.data?.filter((e) => e.kind === 'visit');
  const prescriptions = timeline.data?.filter((e) => e.kind === 'prescription');
  const medsFromHistory = (history.entries ?? []).filter(
    (e) => e.category === 'CURRENT_MEDICATION' && e.status === 'ACTIVE',
  );
  const outOfRange = (results ?? []).filter((r) => {
    const range = parseRange(r.range);
    const value = parseValue(r.value);
    return range && value !== undefined && rangeFlag(value, range) !== 'NORMAL';
  }).length;
  const lastVisit = visits?.[0];

  // Clinical roles read history, results, medication and visits first.
  const contactSection = (
    <SheetRow
      last
      margin={
        !patient.hasAccount && canActivate ? (
          <p>No portal login yet. An activation code lets the patient set one up.</p>
        ) : undefined
      }
    >
      <div className="pt-4">
        <InkSection
          number={canClinical ? 5 : 1}
          title="Contact and account"
          action={
            canActivate && !patient.hasAccount ? (
              <Button variant="secondary" size="sm" onClick={() => setActivating(true)}>
                Send account activation
              </Button>
            ) : undefined
          }
        >
          <dl className="grid gap-x-10 text-[13px] sm:grid-cols-2">
            <ContactLine label="Phone">
              <a href={`tel:${patient.phone}`} className="tabular font-mono hover:text-primary">
                {formatPhone(patient.phone)}
              </a>
            </ContactLine>
            <ContactLine label="Email">{patient.email ?? muted('Not given')}</ContactLine>
            <ContactLine label="Date of birth">
              <span className="tabular font-mono">{formatDate(patient.dateOfBirth)}</span>
            </ContactLine>
            <ContactLine label="Sex">{sexWord(patient.sex) ?? muted('Not recorded')}</ContactLine>
            <ContactLine label="Patient no.">
              {patient.mrn ? (
                <span className="tabular font-mono">{patient.mrn}</span>
              ) : (
                muted('Not issued')
              )}
            </ContactLine>
            <ContactLine label="Patient portal">
              <StatusWord tone={patient.hasAccount ? 'success' : 'neutral'}>
                {patient.hasAccount ? 'Account active' : 'No account yet'}
              </StatusWord>
            </ContactLine>
          </dl>
        </InkSection>
      </div>
    </SheetRow>
  );

  return (
    <>
      {canClinical && (
        <>
          <SheetRow margin={<p>Active entries recorded by clinicians during visits.</p>}>
            <div className="pt-4">
              <InkSection number={1} title="Medical history">
                <HistoryList history={history} />
              </InkSection>
            </div>
          </SheetRow>

          <SheetRow
            margin={
              results && results.length > 0 ? (
                <>
                  <p>
                    Latest value of each test, from{' '}
                    <span className="font-mono text-fg">{formatDate(results[0]!.at)}</span> back.
                  </p>
                  {outOfRange > 0 && (
                    <p className="mt-1 font-medium text-warning-fg">
                      {outOfRange} outside the normal range.
                    </p>
                  )}
                </>
              ) : undefined
            }
          >
            <div className="pt-4">
              <InkSection
                number={2}
                title="Results"
                meta={countMeta(results?.length, 'test', 'tests')}
              >
                <ResultsList results={results} failed={labs.errorStatus !== undefined} />
              </InkSection>
            </div>
          </SheetRow>

          <SheetRow
            margin={
              prescriptions && prescriptions.length > 0 ? (
                <p>Prescribed at this clinic, newest first, then medicines from elsewhere.</p>
              ) : undefined
            }
          >
            <div className="pt-4">
              <InkSection number={3} title="Medication">
                <MedicationList
                  prescriptions={prescriptions}
                  fromHistory={history.loading ? undefined : medsFromHistory}
                  failed={timeline.errorStatus !== undefined}
                />
              </InkSection>
            </div>
          </SheetRow>

          <SheetRow
            margin={
              lastVisit ? (
                <>
                  <MarginLabel>Last visit</MarginLabel>
                  <p className="mt-1 font-mono text-fg">{formatDate(lastVisit.at)}</p>
                </>
              ) : undefined
            }
          >
            <div className="pt-4">
              <InkSection
                number={4}
                title="Visits"
                meta={countMeta(visits?.length, 'visit', 'visits')}
                action={
                  <button
                    type="button"
                    onClick={() => onTab('timeline')}
                    className="cursor-pointer text-[13px] font-medium text-primary hover:text-primary-hover"
                  >
                    Full timeline
                  </button>
                }
              >
                <VisitsList visits={visits} failed={timeline.errorStatus !== undefined} />
              </InkSection>
            </div>
          </SheetRow>
        </>
      )}

      {contactSection}

      {activating && (
        <ActivationDialog
          patientId={patientId}
          name={fullName(patient)}
          onClose={() => setActivating(false)}
        />
      )}
    </>
  );
}

function ContactLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  );
}

function HistoryList({
  history,
}: {
  history: { entries?: HistoryEntry[]; loading: boolean; failed: boolean };
}) {
  if (history.loading)
    return (
      <div className="flex flex-col gap-2 py-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  if (history.failed)
    return <p className="py-3 text-sm text-danger-fg">Medical history could not be loaded.</p>;
  const active = (history.entries ?? []).filter((e) => e.status === 'ACTIVE');
  if (active.length === 0)
    return (
      <p className="flex items-center gap-2 py-3 text-[13px] text-fg-muted">
        <Bandaids size={16} aria-hidden="true" />
        No history recorded. Allergies, conditions and medication are added during visits.
      </p>
    );
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: active.filter((e) => e.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <dl className="text-[13px]">
      {groups.map((group) => (
        <div
          key={group.category}
          className="grid gap-x-6 border-b border-line py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]"
        >
          <dt
            className={`${group.category === 'ALLERGY' ? 'font-medium text-danger-fg' : 'text-fg-muted'}`}
          >
            {humanize(group.category)}
          </dt>
          <dd>
            <ul className="flex flex-col gap-1">
              {group.items.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-fg">{e.description}</span>
                  {e.severity && (
                    <StatusWord tone={e.severity === 'MILD' ? 'neutral' : 'danger'}>
                      {humanize(e.severity)}
                    </StatusWord>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}

const FLAG_WORD = { HIGH: 'High', LOW: 'Low', NORMAL: 'Normal' } as const;

/** Each result with its value in Plex Mono and the range Ruler under it (design system 4). */
function ResultsList({ results, failed }: { results: ResultLine[] | undefined; failed: boolean }) {
  if (failed) return <p className="py-3 text-sm text-danger-fg">Results could not be loaded.</p>;
  if (!results)
    return (
      <div className="flex flex-col gap-2 py-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  if (results.length === 0)
    return (
      <p className="flex items-center gap-2 py-3 text-[13px] text-fg-muted">
        <Flask size={16} aria-hidden="true" />
        No results on record. Tests ordered in a consultation show here once the lab enters them.
      </p>
    );
  return (
    <ul className="grid gap-x-10 text-[13px] @[700px]:grid-cols-2">
      {results.slice(0, 10).map((r) => {
        const range = parseRange(r.range);
        const value = parseValue(r.value);
        const flag = range && value !== undefined ? rangeFlag(value, range) : undefined;
        const out = flag === 'HIGH' || flag === 'LOW';
        return (
          <li key={r.key} className="border-b border-line py-2">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 truncate text-fg" title={r.testName}>
                {r.testName}
              </span>
              <span
                className={`tabular ml-auto shrink-0 font-mono ${out ? 'text-warning-fg' : 'text-fg'}`}
              >
                {r.value}
                {r.unit ? (r.unit === '%' ? '%' : ` ${r.unit}`) : ''}
              </span>
              {flag && (
                <span
                  className={`w-12 shrink-0 text-right text-[11px] font-semibold ${
                    out ? 'text-warning-fg' : 'text-success-fg'
                  }`}
                >
                  {FLAG_WORD[flag]}
                </span>
              )}
            </div>
            {range && value !== undefined && <RangeRuler value={value} range={range} />}
            <p className="mt-0.5 text-[11px] text-fg-muted">
              {r.range ? `normal ${r.range} · ` : 'No range given · '}
              <span className="font-mono">{formatDate(r.at)}</span>
              {r.corrected ? ' · corrected' : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function MedicationList({
  prescriptions,
  fromHistory,
  failed,
}: {
  prescriptions: TimelineLite[] | undefined;
  fromHistory: HistoryEntry[] | undefined;
  failed: boolean;
}) {
  if (failed) return <p className="py-3 text-sm text-danger-fg">Medication could not be loaded.</p>;
  if (!prescriptions || !fromHistory)
    return (
      <div className="flex flex-col gap-2 py-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  if (prescriptions.length + fromHistory.length === 0)
    return (
      <p className="flex items-center gap-2 py-3 text-[13px] text-fg-muted">
        <Pill size={16} aria-hidden="true" />
        No medication on record.
      </p>
    );
  return (
    <ul className="text-[13px]">
      {prescriptions.slice(0, 5).map((p) => (
        <li
          key={p.id}
          className="grid items-baseline gap-x-6 border-b border-line py-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
        >
          <span className="tabular font-mono text-fg-muted">{formatDate(p.at)}</span>
          <span className="text-fg">{p.detail ?? 'Prescription'}</span>
          {p.encounterId ? (
            <Link
              href={`/encounters/${p.encounterId}`}
              className="font-medium text-primary hover:text-primary-hover"
            >
              Open visit
            </Link>
          ) : (
            <span />
          )}
        </li>
      ))}
      {fromHistory.map((m) => (
        <li
          key={m.id}
          className="grid items-baseline gap-x-6 border-b border-line py-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
        >
          <span className="text-fg-muted">From elsewhere</span>
          <span className="text-fg">{m.description}</span>
          <span />
        </li>
      ))}
    </ul>
  );
}

function VisitsList({ visits, failed }: { visits: TimelineLite[] | undefined; failed: boolean }) {
  if (failed) return <p className="py-3 text-sm text-danger-fg">Visits could not be loaded.</p>;
  if (!visits)
    return (
      <div className="flex flex-col gap-2 py-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    );
  if (visits.length === 0)
    return (
      <p className="flex items-center gap-2 py-3 text-[13px] text-fg-muted">
        <Stethoscope size={16} aria-hidden="true" />
        No visits yet. A visit starts when the patient is checked in.
      </p>
    );
  return (
    <ol className="text-[13px]">
      {visits.slice(0, 6).map((v) => (
        <li
          key={v.id}
          className="grid items-baseline gap-x-6 border-b border-line py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
        >
          <span className="tabular font-mono text-fg">
            {formatDate(v.at)} <span className="text-fg-muted">{formatTime(v.at)}</span>
          </span>
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-fg">{v.title}</span>
            {v.detail && <span className="text-fg-muted">{v.detail}</span>}
            {v.status && (
              <StatusWord tone={timelineTone(v.status)}>{humanize(v.status)}</StatusWord>
            )}
          </span>
          {v.encounterId ? (
            <Link
              href={`/encounters/${v.encounterId}`}
              className="font-medium text-primary hover:text-primary-hover"
            >
              Open visit
            </Link>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ol>
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
    <InkSection
      title="Timeline"
      meta={
        data ? (
          <span className="tabular font-mono">
            {entries.length} of {data.length} entries
          </span>
        ) : undefined
      }
      action={
        <InkFilters
          label="Show"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            key: f.key,
            label: f.label,
          }))}
        />
      }
    >
      {errorStatus !== undefined && !loading ? (
        <LoadError status={errorStatus} onRetry={reload} />
      ) : loading ? (
        <div className="flex flex-col gap-3 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
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
        <ol>
          {days.map((group) => (
            <li
              key={group.day}
              className="grid gap-x-6 border-b border-line py-3 last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)]"
            >
              <h3 className="tabular pt-0.5 font-mono text-[12px] font-medium text-fg">
                {formatDate(`${group.day}T12:00:00+05:30`)}
              </h3>
              <ol className="divide-y divide-line">
                {group.items.map((entry) => {
                  const KindIcon = KIND_ICON[entry.kind] ?? ClipboardText;
                  return (
                    <li
                      key={entry.id}
                      className="grid grid-cols-[44px_18px_minmax(0,1fr)_auto] items-baseline gap-x-2 py-1.5 text-[13px] first:pt-0"
                    >
                      <span className="tabular font-mono text-fg-subtle">
                        {formatTime(entry.at)}
                      </span>
                      <KindIcon
                        size={15}
                        aria-hidden="true"
                        className="translate-y-0.5 text-fg-muted"
                      />
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="font-medium text-fg">{entry.title}</span>
                        {entry.detail && <span className="text-fg-muted">{entry.detail}</span>}
                        {entry.status && (
                          <StatusWord tone={timelineTone(entry.status)}>
                            {humanize(entry.status)}
                          </StatusWord>
                        )}
                      </span>
                      {entry.encounterId ? (
                        <Link
                          href={`/encounters/${entry.encounterId}`}
                          className="font-medium text-primary hover:text-primary-hover"
                        >
                          Open visit
                        </Link>
                      ) : (
                        <span />
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </InkSection>
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
    {
      header: 'Added',
      render: (d) => <span className="tabular font-mono">{formatDate(d.createdAt)}</span>,
    },
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
    <InkSection
      title="Documents"
      meta={countMeta(data?.length, 'file', 'files')}
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
    >
      <p className="pb-2 text-[13px] text-fg-muted">
        Photos, ID proof, insurance cards and signed forms kept with this record.
      </p>
      {openError && (
        <p
          role="alert"
          className="mb-3 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {openError}
        </p>
      )}
      {errorStatus !== undefined && !loading ? (
        <LoadError status={errorStatus} onRetry={reload} />
      ) : (
        <Flush>
          <RuledTable
            columns={columns}
            rows={data}
            getRowKey={(d) => d.id}
            loading={loading}
            minWidth={640}
            empty={
              <EmptyState
                icon={File}
                title="No documents yet"
                description="Add a photo, ID proof, insurance card or signed form."
                action={
                  canWrite ? (
                    <Button
                      variant="secondary"
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
        </Flush>
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
    </InkSection>
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
    <div className="flex flex-col gap-8">
      <InkSection
        number={1}
        title="Current consent"
        meta="The latest answer for each kind of consent"
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
      >
        {errorStatus !== undefined && !loading ? (
          <LoadError status={errorStatus} onRetry={reload} />
        ) : loading ? (
          <div className="flex flex-col gap-2 py-3">
            {CONSENT_TYPES.map((t) => (
              <Skeleton key={t} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ul className="text-[13px]">
            {CONSENT_TYPES.map((type) => {
              const state = data?.current[type];
              const entry = latest.get(type);
              return (
                <li
                  key={type}
                  className="grid items-baseline gap-x-6 gap-y-1 border-b border-line py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_220px_64px]"
                >
                  <span>
                    <span className="block font-medium text-fg">{CONSENT_LABEL[type]}</span>
                    <span className="block text-fg-muted">{CONSENT_HINT[type]}</span>
                  </span>
                  <StatusWord
                    tone={
                      state === 'GRANTED' ? 'success' : state === 'REVOKED' ? 'danger' : 'neutral'
                    }
                  >
                    {state === 'GRANTED'
                      ? 'Given'
                      : state === 'REVOKED'
                        ? 'Withdrawn'
                        : 'Not recorded'}
                  </StatusWord>
                  <span className="text-fg-subtle">
                    {entry ? (
                      <>
                        <span className="tabular font-mono">
                          {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
                        </span>
                        {entry.recordedBy ? ` by ${entry.recordedBy.fullName}` : ''}
                      </>
                    ) : (
                      'Nothing recorded yet'
                    )}
                  </span>
                  <span className="sm:text-right">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => setRecording(type)}
                        aria-label={`${state ? 'Update' : 'Record'} ${CONSENT_LABEL[type].toLowerCase()} consent`}
                        className="cursor-pointer font-medium text-primary hover:text-primary-hover"
                      >
                        {state ? 'Update' : 'Record'}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </InkSection>

      {data && history.length > 0 && (
        <InkSection number={2} title="History" meta="Every answer ever recorded, newest first">
          <ul className="text-[13px]">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="grid items-baseline gap-x-6 border-b border-line py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)_110px]"
              >
                <span className="tabular font-mono text-fg-muted">
                  {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
                </span>
                <span className="text-fg">
                  {CONSENT_LABEL[entry.consentType]}
                  {entry.recordedBy && (
                    <span className="text-fg-subtle"> by {entry.recordedBy.fullName}</span>
                  )}
                </span>
                <StatusWord tone={entry.action === 'GRANTED' ? 'success' : 'danger'}>
                  {entry.action === 'GRANTED' ? 'Given' : 'Withdrawn'}
                </StatusWord>
              </li>
            ))}
          </ul>
        </InkSection>
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
