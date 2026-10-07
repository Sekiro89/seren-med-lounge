'use client';

import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarCheck,
  ChatCircleText,
  Envelope,
  GraduationCap,
  Handshake,
  NotePencil,
  Phone,
  Swap,
  UserCircleMinus,
  UserPlus,
  type Icon,
} from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import {
  Figures,
  InkSection,
  InkSheet,
  MarginNote,
  SheetHead,
  SheetRail,
} from '../../../../components/ui/ink';
import { StageRuler, type Stage } from '../../../../components/ui/stage-ruler';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Select, Textarea, Input } from '../../../../components/ui/fields';
import { NoAccess } from '../../../../components/ui/no-access';
import { Skeleton } from '../../../../components/ui/skeleton';
import { Badge } from '../../../../components/ui/badge';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, fullName } from '../../../../lib/format';
import {
  focusFirst,
  invalidProps,
  isClean,
  req,
  requiredProps,
  type FieldErrors,
  clearOnEdit,
  makeClearError,
} from '../../../../lib/forms';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { ConvertDialog, LostDialog } from '../_components/lead-dialogs';
import {
  ErrorPanel,
  FormError,
  LeadStatusBadge,
  SOURCE_LABELS,
  STATUS_LABELS,
  leadName,
  localToIso,
  messageOf,
  type LeadActivity,
  type LeadDetail,
  type LeadStatus,
} from '../_components/shared';
import { leadActivitySchema } from '@serenemed/validation';

const ACTIVITY_TYPES = [
  { value: 'CALL', label: 'Call', icon: Phone, outreach: true },
  { value: 'MESSAGE', label: 'Message', icon: ChatCircleText, outreach: true },
  { value: 'EMAIL', label: 'Email', icon: Envelope, outreach: true },
  { value: 'EDUCATION_SENT', label: 'Information sent', icon: GraduationCap, outreach: true },
  { value: 'MEETING', label: 'Meeting', icon: Handshake, outreach: false },
  { value: 'NOTE', label: 'Note', icon: NotePencil, outreach: false },
] as const;

const TIMELINE_ICONS: Record<string, Icon> = {
  ...Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.value, t.icon])),
  STATUS_CHANGE: Swap,
};
const TIMELINE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.value, t.label])),
  STATUS_CHANGE: 'Stage changed',
};

/** Turns "NEW -> LOST: reason" into "New to Lost: reason". */
function prettyStatusNote(notes: string): string {
  return notes
    .replace(/\b(NEW|CONTACTED|NURTURING|APPOINTMENT_BOOKED|CONVERTED|LOST)\b/g, (s) =>
      STATUS_LABELS[s as LeadStatus].toLowerCase(),
    )
    .replace(/ -> /g, ' to ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Which manual stage moves are allowed from each status (mirrors the API). */
const MOVES: Record<
  LeadStatus,
  { to: 'NURTURING' | 'APPOINTMENT_BOOKED' | 'LOST'; label: string }[]
> = {
  NEW: [
    { to: 'NURTURING', label: 'Move to nurturing' },
    { to: 'APPOINTMENT_BOOKED', label: 'Appointment booked' },
    { to: 'LOST', label: 'Mark as lost' },
  ],
  CONTACTED: [
    { to: 'NURTURING', label: 'Move to nurturing' },
    { to: 'APPOINTMENT_BOOKED', label: 'Appointment booked' },
    { to: 'LOST', label: 'Mark as lost' },
  ],
  NURTURING: [
    { to: 'APPOINTMENT_BOOKED', label: 'Appointment booked' },
    { to: 'LOST', label: 'Mark as lost' },
  ],
  APPOINTMENT_BOOKED: [
    { to: 'NURTURING', label: 'Back to nurturing' },
    { to: 'LOST', label: 'Mark as lost' },
  ],
  LOST: [{ to: 'NURTURING', label: 'Reopen as nurturing' }],
  CONVERTED: [],
};

/** The lead's journey on the Ruler. Lost stops the line where the lead was. */
const JOURNEY: { status: LeadStatus; label: string }[] = [
  { status: 'NEW', label: 'New' },
  { status: 'CONTACTED', label: 'Contacted' },
  { status: 'NURTURING', label: 'Nurturing' },
  { status: 'APPOINTMENT_BOOKED', label: 'Booked' },
  { status: 'CONVERTED', label: 'Patient' },
];

function journey(lead: LeadDetail): Stage[] {
  const order = JOURNEY.map((j) => j.status);
  let at: number;
  if (lead.status === 'LOST') {
    // "NURTURING -> LOST: reason" on the latest stage change tells where it stopped.
    const change = [...lead.activities]
      .reverse()
      .find((a) => a.type === 'STATUS_CHANGE' && a.notes?.includes('-> LOST'));
    const from = change?.notes?.split(' -> ')[0]?.trim() as LeadStatus | undefined;
    at = Math.max(0, from ? order.indexOf(from) : 0);
  } else {
    at = order.indexOf(lead.status);
  }
  return JOURNEY.map((j, i) => ({
    label: j.label,
    state:
      i < at || (lead.status === 'CONVERTED' && i === at)
        ? 'done'
        : i === at
          ? lead.status === 'LOST'
            ? 'stopped'
            : 'current'
          : 'todo',
    note:
      i === at && lead.status === 'LOST'
        ? 'lost'
        : i === at && lead.status !== 'CONVERTED'
          ? 'now'
          : i === 0
            ? formatDate(lead.createdAt).slice(0, 6)
            : j.status === 'CONVERTED' && lead.convertedAt
              ? formatDate(lead.convertedAt).slice(0, 6)
              : undefined,
  }));
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStaff();
  const allowed = can(user.role, 'lead:read');
  const canWrite = can(user.role, 'lead:write');
  const canConvert = canWrite && can(user.role, 'patient:write');
  const detail = useApi<LeadDetail>(allowed ? `/leads/${encodeURIComponent(id)}` : null);
  const lead = detail.data;
  const [lostOpen, setLostOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [moving, setMoving] = useState<string>();
  const [moveError, setMoveError] = useState<string>();

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const move = async (to: 'NURTURING' | 'APPOINTMENT_BOOKED') => {
    setMoving(to);
    setMoveError(undefined);
    try {
      await apiClient.post(`/leads/${id}/status`, { status: to });
      detail.reload();
    } catch (e) {
      setMoveError(messageOf(e, 'The stage was not changed. Please try again.'));
    } finally {
      setMoving(undefined);
    }
  };

  const closed = lead?.status === 'CONVERTED' || lead?.status === 'LOST';

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-primary hover:text-primary-hover"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Leads
      </Link>

      {detail.loading && (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!detail.loading && detail.errorStatus === 404 && (
        <Card>
          <EmptyState
            icon={UserCircleMinus}
            title="Lead not found"
            description="This lead does not exist, or it belongs to another clinic."
            action={
              <Link href="/leads" className="text-sm font-medium text-primary">
                Back to leads
              </Link>
            }
          />
        </Card>
      )}

      {!detail.loading && detail.errorStatus !== undefined && detail.errorStatus !== 404 && (
        <Card>
          <ErrorPanel message={detail.errorMessage} onRetry={detail.reload} />
        </Card>
      )}

      {lead && (
        <>
          <InkSheet>
            <SheetHead
              eyebrow={`Lead · ${SOURCE_LABELS[lead.source] ?? lead.source} · added ${formatDate(lead.createdAt)}`}
              title={leadName(lead)}
              description={
                <span className="tabular font-mono">
                  {lead.phone}
                  {lead.email ? <span className="font-sans"> · {lead.email}</span> : ''}
                </span>
              }
              figures={
                <Figures
                  className="items-start!"
                  items={[
                    {
                      label: 'Activities',
                      value: lead.activities.filter((a) => a.type !== 'STATUS_CHANGE').length,
                    },
                    {
                      label: 'Next follow-up',
                      value:
                        lead.nextFollowUpAt && !closed
                          ? formatDate(lead.nextFollowUpAt).slice(0, 6)
                          : '-',
                      hint:
                        lead.nextFollowUpAt && !closed
                          ? formatTime(lead.nextFollowUpAt)
                          : undefined,
                    },
                  ]}
                />
              }
              action={
                <>
                  <LeadStatusBadge status={lead.status} />
                  {canConvert && lead.status !== 'CONVERTED' && (
                    <Button
                      icon={<UserPlus size={18} aria-hidden="true" />}
                      onClick={() => setConvertOpen(true)}
                    >
                      Convert to patient
                    </Button>
                  )}
                </>
              }
            />

            <div className="border-b border-line px-5 pb-4 pt-6 sm:px-10">
              <StageRuler label="Lead journey" stages={journey(lead)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-w-0 flex-col gap-8 px-5 pb-8 pt-6 sm:px-8">
                {canWrite && !closed && <Composer lead={lead} onSaved={detail.reload} />}
                {canWrite && closed && (
                  <p className="bg-surface-muted px-4 py-3 text-[13px] text-fg-muted">
                    {lead.status === 'CONVERTED'
                      ? 'This lead is now a patient, so new activity is recorded on the patient record.'
                      : 'This lead is marked lost. Reopen it as nurturing to log more activity.'}
                  </p>
                )}
                <InkSection
                  number={canWrite && !closed ? 2 : 1}
                  title="Activity"
                  meta="Newest first"
                >
                  <Timeline activities={lead.activities} />
                </InkSection>
              </div>

              <SheetRail label="Lead details and stage">
                {canWrite && MOVES[lead.status].length > 0 && (
                  <InkSection title="Stage">
                    <div className="mt-3 flex flex-col gap-2">
                      {MOVES[lead.status].map((m) => (
                        <Button
                          key={m.to}
                          variant={m.to === 'LOST' ? 'ghost' : 'secondary'}
                          loading={moving === m.to}
                          onClick={() => (m.to === 'LOST' ? setLostOpen(true) : void move(m.to))}
                          className="w-full"
                        >
                          {m.label}
                        </Button>
                      ))}
                      <FormError message={moveError} />
                    </div>
                  </InkSection>
                )}

                <InkSection title="Enquiry">
                  <dl className="divide-y divide-line">
                    <Detail label="Asked about">
                      {lead.enquiry ?? <span className="text-fg-subtle">Nothing written down</span>}
                    </Detail>
                    <Detail label="Source">{SOURCE_LABELS[lead.source] ?? lead.source}</Detail>
                    {lead.campaign && (
                      <Detail label="Campaign">
                        <Link
                          href={`/campaigns/${lead.campaign.id}`}
                          className="text-primary hover:underline"
                        >
                          {lead.campaign.name}
                        </Link>
                      </Detail>
                    )}
                    {lead.referredByPatient && (
                      <Detail label="Referred by">
                        <Link
                          href={`/patients/${lead.referredByPatient.id}`}
                          className="text-primary hover:underline"
                        >
                          {fullName(lead.referredByPatient)}
                        </Link>
                      </Detail>
                    )}
                    <Detail label="Owner">
                      {lead.owner?.fullName ?? <span className="text-fg-subtle">Unassigned</span>}
                    </Detail>
                    <Detail label="Consent">
                      {lead.consentToContact ? (
                        <span className="flex flex-col items-start gap-1">
                          <Badge tone="success">Agreed to be contacted</Badge>
                          {lead.consentRecordedAt && (
                            <span className="text-[12px] text-fg-subtle">
                              Recorded{' '}
                              <span className="font-mono">
                                {formatDate(lead.consentRecordedAt)}
                              </span>
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="flex flex-col items-start gap-1">
                          <Badge tone="warning">Not agreed</Badge>
                          <MarginNote>
                            Calls, messages and emails are blocked. Notes and meetings are allowed.
                          </MarginNote>
                        </span>
                      )}
                    </Detail>
                    {lead.status === 'LOST' && (
                      <Detail label="Lost because">
                        {lead.lostReason ?? <span className="text-fg-subtle">No reason given</span>}
                      </Detail>
                    )}
                    {lead.convertedPatient && (
                      <Detail label="Patient record">
                        <Link
                          href={`/patients/${lead.convertedPatient.id}`}
                          className="text-primary hover:underline"
                        >
                          {fullName(lead.convertedPatient)}
                        </Link>
                      </Detail>
                    )}
                    <Detail label="Added">
                      <span className="tabular font-mono">{formatDate(lead.createdAt)}</span>
                    </Detail>
                  </dl>
                </InkSection>
              </SheetRail>
            </div>
          </InkSheet>

          <LostDialog
            lead={lead}
            open={lostOpen}
            onClose={() => setLostOpen(false)}
            onSaved={detail.reload}
          />
          <ConvertDialog
            lead={lead}
            open={convertOpen}
            onClose={() => setConvertOpen(false)}
            onSaved={detail.reload}
          />
        </>
      )}
    </div>
  );
}

function Composer({ lead, onSaved }: { lead: LeadDetail; onSaved: () => void }) {
  const [type, setType] = useState<string>(lead.consentToContact ? 'CALL' : 'NOTE');
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [blocked, setBlocked] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));

  const outreach = ACTIVITY_TYPES.find((t) => t.value === type)?.outreach ?? false;
  const noConsent = !lead.consentToContact;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const next_: FieldErrors = {};
    if (!ACTIVITY_TYPES.some((t) => t.value === type)) next_['act-type'] = 'Choose what happened.';
    else if (noConsent && outreach) {
      next_['act-type'] =
        'This lead has not agreed to be contacted. Log a note or meeting instead.';
    }
    if (type === 'NOTE' && !notes.trim()) next_['act-notes'] = 'Write the note.';
    else if (notes.length > 2000) next_['act-notes'] = 'Use 2000 characters or fewer.';
    if (next) {
      const at = new Date(localToIso(next)).getTime();
      if (Number.isNaN(at)) next_['act-next'] = 'Enter a valid date and time.';
      else if (at < Date.now() - 60_000)
        next_['act-next'] = 'Choose a follow-up time in the future.';
    }
    setErrors(next_);
    if (!isClean(next_)) return focusFirst(next_, ['act-type', 'act-next', 'act-notes']);
    const parsed = leadActivitySchema.safeParse({
      type,
      notes: notes.trim() || undefined,
      nextFollowUpAt: next ? localToIso(next) : undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form.');
    setBusy(true);
    setBlocked(false);
    try {
      await apiClient.post(`/leads/${lead.id}/activities`, parsed.data);
      setNotes('');
      setNext('');
      onSaved();
    } catch (e) {
      setError(messageOf(e, 'The activity was not saved. Please try again.'));
      setBlocked(noConsent && outreach);
    } finally {
      setBusy(false);
    }
  };

  return (
    <InkSection number={1} title="Log activity" meta="What you did, and when to follow up next">
      <form
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError, { 'act-type': ['act-notes'] })}
        className="flex flex-col gap-4 pt-3"
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={req('What happened')} htmlFor="act-type" error={errors['act-type']}>
            <Select
              id="act-type"
              value={type}
              {...requiredProps}
              {...invalidProps(errors['act-type'])}
              onChange={(e) => setType(e.target.value)}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next follow-up (optional)" htmlFor="act-next" error={errors['act-next']}>
            <Input
              id="act-next"
              type="datetime-local"
              value={next}
              {...invalidProps(errors['act-next'])}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
        </div>
        {noConsent && outreach && (
          <p className="rounded-control bg-warning-bg px-3 py-2 text-sm text-warning-fg">
            This lead has not agreed to be contacted, so a call, message, email or information pack
            will be refused. Log a note or meeting instead.
          </p>
        )}
        <Field
          label={type === 'NOTE' ? req('Notes') : 'Notes (optional)'}
          htmlFor="act-notes"
          error={errors['act-notes']}
        >
          <Textarea
            id="act-notes"
            value={notes}
            maxLength={2000}
            {...(type === 'NOTE' ? requiredProps : {})}
            {...invalidProps(errors['act-notes'])}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        {blocked && (
          <p className="-mt-3 text-[13px] text-fg-muted">
            Calls, messages and emails are only allowed once a lead has agreed to be contacted. Log
            a note or meeting for now.
          </p>
        )}
        <div>
          <Button type="submit" loading={busy}>
            Save activity
          </Button>
        </div>
      </form>
    </InkSection>
  );
}

function Timeline({ activities }: { activities: LeadActivity[] }) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Nothing logged yet"
        description="Calls, messages, meetings and notes you log will appear here."
      />
    );
  }
  const ordered = [...activities].reverse();
  return (
    <ol className="divide-y divide-line">
      {ordered.map((a) => {
        const TypeIcon = TIMELINE_ICONS[a.type] ?? NotePencil;
        return (
          <li key={a.id} className="grid grid-cols-[88px_20px_minmax(0,1fr)] gap-x-3 py-3">
            <time
              dateTime={a.createdAt}
              className="tabular pt-px font-mono text-[12px] text-fg-muted"
            >
              {formatDate(a.createdAt).slice(0, 6)}
              <span className="block">{formatTime(a.createdAt)}</span>
            </time>
            <TypeIcon size={18} aria-hidden="true" className="mt-px shrink-0 text-fg-subtle" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">{TIMELINE_LABELS[a.type] ?? a.type}</p>
              {a.notes && (
                <p className="mt-0.5 max-w-[72ch] whitespace-pre-wrap text-[13px] text-fg-muted">
                  {a.type === 'STATUS_CHANGE' ? prettyStatusNote(a.notes) : a.notes}
                </p>
              )}
              {a.actor && (
                <p className="mt-0.5 text-[12px] text-fg-subtle">By {a.actor.fullName}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
