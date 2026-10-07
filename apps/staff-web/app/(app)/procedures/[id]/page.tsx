'use client';

import { use, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Plus, Scissors, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import {
  Figures,
  InkSection,
  InkSheet,
  LedgerLine,
  MarginNote,
  SheetHead,
  SheetRail,
} from '../../../../components/ui/ink';
import { StageRuler, type Stage } from '../../../../components/ui/stage-ruler';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { NoAccess } from '../../../../components/ui/no-access';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import {
  focusFirst,
  invalidProps,
  req,
  requiredProps,
  type FieldErrors,
  clearOnEdit,
  makeClearError,
} from '../../../../lib/forms';
import { formatDate, formatMoney, formatTime, fullName, humanize } from '../../../../lib/format';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import {
  CancelProcedureDialog,
  EstimateDialog,
  ScheduleDialog,
} from '../_components/action-dialogs';
import {
  messageOf,
  STATUS_TONE,
  type DoctorOption,
  type ProcedureDetail,
} from '../_components/helpers';

interface DocumentRow {
  id: string;
  documentType: string;
  fileName: string;
  createdAt: string;
  deletedAt: string | null;
}

type Dialogs = 'estimate' | 'schedule' | 'cancel' | undefined;

const STAGES = [
  { status: 'PLANNED', label: 'Planned' },
  { status: 'SCHEDULED', label: 'Scheduled' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'COMPLETED', label: 'Completed' },
] as const;

/** The procedure on the Ruler; a cancelled one stops red where it was. */
function stagesOf(p: ProcedureDetail): Stage[] {
  const order = STAGES.map((s) => s.status as string);
  const at =
    p.status === 'CANCELLED' ? (p.startedAt ? 2 : p.scheduledAt ? 1 : 0) : order.indexOf(p.status);
  const when: Record<string, string | null> = {
    SCHEDULED: p.scheduledAt,
    IN_PROGRESS: p.startedAt,
    COMPLETED: p.completedAt,
  };
  return STAGES.map((s, i) => {
    const date = when[s.status];
    const stamp = date ? `${formatDate(date).slice(0, 6)} ${formatTime(date)}` : undefined;
    if (i === at && p.status === 'CANCELLED')
      return { label: s.label, state: 'stopped', note: 'cancelled' };
    if (i < at || (i === at && p.status === 'COMPLETED'))
      return { label: s.label, state: 'done', note: stamp };
    if (i === at) return { label: s.label, state: 'current', note: stamp ?? 'now' };
    return { label: s.label, state: 'todo', note: s.status === 'SCHEDULED' ? stamp : undefined };
  });
}

export default function ProcedureRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStaff();
  const allowed = can(user.role, 'procedure:manage');
  const canSurgery = can(user.role, 'surgery:manage');
  const canDocuments = can(user.role, 'patient:read');
  const detail = useApi<ProcedureDetail>(allowed ? `/procedures/${encodeURIComponent(id)}` : null);
  const procedure = detail.data;

  const documents = useApi<DocumentRow[]>(
    allowed && canDocuments && procedure
      ? `/patient-documents/patient/${encodeURIComponent(procedure.patientId)}`
      : null,
  );
  const seniors = useApi<DoctorOption[]>(allowed ? '/users/directory?role=SENIOR_DOCTOR' : null);
  const juniors = useApi<DoctorOption[]>(allowed ? '/users/directory?role=JUNIOR_DOCTOR' : null);
  const doctors = useMemo(
    () => [...(seniors.data ?? []), ...(juniors.data ?? [])],
    [seniors.data, juniors.data],
  );

  const [dialog, setDialog] = useState<Dialogs>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [newItem, setNewItem] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setFieldErrors, () => setError(undefined));

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const act = async (key: string, path: string, body: unknown, fallback: string) => {
    setBusy(key);
    setError(undefined);
    try {
      await apiClient.post(`/procedures/${id}/${path}`, body ?? {});
      detail.reload();
      return true;
    } catch (e) {
      setError(messageOf(e, fallback));
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const mayAct = procedure ? procedure.kind !== 'SURGERY' || canSurgery : false;
  const editable = mayAct && (procedure?.status === 'PLANNED' || procedure?.status === 'SCHEDULED');

  const consentDocs = (documents.data ?? []).filter(
    (d) => d.documentType === 'CONSENT_FORM' && !d.deletedAt,
  );
  const attached = procedure?.consentDocumentId
    ? (documents.data ?? []).find((d) => d.id === procedure.consentDocumentId)
    : undefined;

  const missing: string[] = [];
  if (procedure) {
    if (procedure.status === 'PLANNED')
      missing.push('Schedule the procedure with a date and doctor.');
    if (!procedure.consentDocumentId) missing.push('Attach the signed consent form.');
    const open = procedure.checklist.filter((i) => !i.completedAt).length;
    if (open > 0) {
      missing.push(`${open} pre-op checklist ${open === 1 ? 'item is' : 'items are'} not done.`);
    }
  }

  const readyTotal = (procedure?.checklist.length ?? 0) + 1;
  const readyDone =
    (procedure?.checklist.filter((i) => i.completedAt).length ?? 0) +
    (procedure?.consentDocumentId ? 1 : 0);

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    const label = newItem.trim();
    if (busy) return;
    const next: FieldErrors = {};
    if (!label) next['new-item'] = 'Write the checklist item first.';
    else if (label.length > 300) next['new-item'] = 'Use 300 characters or fewer.';
    setFieldErrors((prev) => ({ ...prev, 'new-item': next['new-item'] }));
    if (next['new-item']) return focusFirst(next, ['new-item']);
    if (await act('add', 'checklist', { label }, 'The item was not added.')) setNewItem('');
  };

  const attach = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const missingDoc = documentId.trim()
      ? undefined
      : canDocuments
        ? 'Choose the consent form to attach.'
        : 'Enter the consent form document ID.';
    setFieldErrors((prev) => ({ ...prev, 'consent-doc': missingDoc }));
    if (missingDoc) return focusFirst({ 'consent-doc': missingDoc }, ['consent-doc']);
    if (
      await act(
        'consent',
        'consent',
        { documentId: documentId.trim() },
        'The form was not attached.',
      )
    ) {
      setDocumentId('');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/procedures"
        className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-primary hover:text-primary-hover"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Procedures
      </Link>

      {detail.loading && (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {!detail.loading && detail.errorStatus === 404 && (
        <Card>
          <EmptyState
            icon={Scissors}
            title="Procedure not found"
            description="This procedure does not exist, or it belongs to another clinic."
            action={
              <Link href="/procedures" className="text-sm font-medium text-primary">
                Back to procedures
              </Link>
            }
          />
        </Card>
      )}
      {!detail.loading && detail.errorStatus !== undefined && detail.errorStatus !== 404 && (
        <Card>
          <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
            <WarningCircle size={24} className="text-danger-fg" aria-hidden="true" />
            <p className="mt-3 text-sm text-fg">This procedure could not be loaded.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={detail.reload}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {procedure && (
        <>
          {!mayAct && (
            <p role="status" className="bg-surface-muted px-4 py-2.5 text-[13px] text-fg-muted">
              This is a surgery. Your role can view it but not change it.
            </p>
          )}
          {error && (
            <p role="alert" className="bg-danger-bg px-4 py-2.5 text-sm text-danger-fg">
              {error}
            </p>
          )}

          <InkSheet>
            <SheetHead
              eyebrow={`${procedure.kind === 'SURGERY' ? 'Surgery' : 'Procedure'} record`}
              title={procedure.name}
              description={
                <>
                  {canDocuments ? (
                    <Link
                      href={`/patients/${procedure.patient.id}`}
                      className="font-medium text-fg hover:text-primary"
                    >
                      {fullName(procedure.patient)}
                    </Link>
                  ) : (
                    <span className="font-medium text-fg">{fullName(procedure.patient)}</span>
                  )}
                  {procedure.performedBy ? ` · ${procedure.performedBy.fullName}` : ''}
                  {procedure.location ? ` · ${procedure.location}` : ''}
                </>
              }
              figures={
                <Figures
                  className="items-start!"
                  items={[
                    {
                      label: 'Scheduled',
                      value: procedure.scheduledAt
                        ? formatDate(procedure.scheduledAt).slice(0, 6)
                        : '-',
                      hint: procedure.scheduledAt ? formatTime(procedure.scheduledAt) : undefined,
                    },
                    {
                      label: 'Ready',
                      value: `${readyDone}/${readyTotal}`,
                      tone:
                        readyDone < readyTotal &&
                        (procedure.status === 'PLANNED' || procedure.status === 'SCHEDULED')
                          ? 'warning'
                          : undefined,
                    },
                    {
                      label: 'Estimate',
                      value:
                        procedure.estimateMinor === null
                          ? '-'
                          : formatMoney(procedure.estimateMinor).replace(/\.00$/, ''),
                    },
                  ]}
                />
              }
              action={
                <>
                  {procedure.kind === 'SURGERY' && <Badge tone="info">Surgery</Badge>}
                  <Badge tone={STATUS_TONE[procedure.status]}>{humanize(procedure.status)}</Badge>
                </>
              }
            />

            <div className="border-b border-line px-5 pb-4 pt-6 sm:px-10">
              <StageRuler label="Procedure stages" stages={stagesOf(procedure)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-w-0 flex-col gap-8 px-5 pb-8 pt-6 sm:px-8">
                <InkSection
                  number={1}
                  title="Consent form"
                  meta={procedure.consentDocumentId ? 'attached' : 'missing'}
                >
                  <p className="flex items-center gap-2.5 py-3 text-[13px] text-fg">
                    <CheckBox done={Boolean(procedure.consentDocumentId)} />
                    {procedure.consentDocumentId
                      ? attached
                        ? `Attached: ${attached.fileName}`
                        : 'A signed consent form is attached.'
                      : 'No consent form attached.'}
                  </p>
                  {editable && (
                    <form
                      onSubmit={attach}
                      noValidate
                      onChange={clearOnEdit(clearError)}
                      className="flex max-w-lg flex-wrap items-end gap-3 border-t border-line pt-3"
                    >
                      <div className="min-w-56 flex-1">
                        {canDocuments ? (
                          <Field
                            label={req('Consent form')}
                            htmlFor="consent-doc"
                            error={fieldErrors['consent-doc']}
                            helper={
                              documents.loading
                                ? 'Loading this patient’s documents.'
                                : consentDocs.length === 0
                                  ? 'This patient has no consent form on file. Upload one at registration first.'
                                  : undefined
                            }
                          >
                            <Select
                              id="consent-doc"
                              value={documentId}
                              disabled={consentDocs.length === 0}
                              {...requiredProps}
                              {...invalidProps(fieldErrors['consent-doc'])}
                              onChange={(e) => setDocumentId(e.target.value)}
                            >
                              <option value="">Choose a form</option>
                              {consentDocs.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.fileName}, {formatDate(d.createdAt)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        ) : (
                          <Field
                            label={req('Consent form document ID')}
                            htmlFor="consent-doc"
                            error={fieldErrors['consent-doc']}
                            helper="Your role cannot list patient documents, so enter the ID of the patient's consent form."
                          >
                            <Input
                              id="consent-doc"
                              value={documentId}
                              {...requiredProps}
                              {...invalidProps(fieldErrors['consent-doc'])}
                              onChange={(e) => setDocumentId(e.target.value)}
                            />
                          </Field>
                        )}
                      </div>
                      <Button type="submit" variant="secondary" loading={busy === 'consent'}>
                        Attach form
                      </Button>
                    </form>
                  )}
                </InkSection>

                <InkSection
                  number={2}
                  title="Pre-op checklist"
                  meta={
                    procedure.checklist.length > 0 ? (
                      <span className="tabular font-mono">
                        {procedure.checklist.filter((i) => i.completedAt).length}/
                        {procedure.checklist.length} done
                      </span>
                    ) : undefined
                  }
                >
                  {procedure.checklist.length === 0 ? (
                    <p className="py-3 text-[13px] text-fg-muted">No checklist items yet.</p>
                  ) : (
                    <ol className="divide-y divide-line">
                      {procedure.checklist.map((item, index) => {
                        const done = Boolean(item.completedAt);
                        return (
                          <li key={item.id} className="flex min-h-11 items-center gap-3 py-2">
                            <span
                              aria-hidden="true"
                              className="tabular w-6 shrink-0 font-mono text-[12px] text-fg-subtle"
                            >
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <input
                              id={`item-${item.id}`}
                              type="checkbox"
                              checked={done}
                              disabled={!editable || busy === `item-${item.id}`}
                              onChange={() =>
                                void act(
                                  `item-${item.id}`,
                                  `checklist/${item.id}`,
                                  { done: !done },
                                  'The item was not updated.',
                                )
                              }
                              className="size-[18px] shrink-0 cursor-pointer accent-primary disabled:cursor-default"
                            />
                            <label
                              htmlFor={`item-${item.id}`}
                              className={`flex-1 text-[13px] ${done ? 'text-fg-muted line-through' : 'text-fg'}`}
                            >
                              {item.label}
                            </label>
                            <span className="tabular shrink-0 font-mono text-[12px] text-fg-subtle">
                              {item.completedAt
                                ? `${formatDate(item.completedAt).slice(0, 6)} ${formatTime(item.completedAt)}`
                                : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {editable && (
                    <form
                      onSubmit={addItem}
                      noValidate
                      onChange={clearOnEdit(clearError)}
                      className="flex max-w-lg flex-wrap items-end gap-3 border-t border-line pt-3"
                    >
                      <div className="min-w-56 flex-1">
                        <Field
                          label={req('New checklist item')}
                          htmlFor="new-item"
                          error={fieldErrors['new-item']}
                        >
                          <Input
                            id="new-item"
                            value={newItem}
                            maxLength={300}
                            {...requiredProps}
                            {...invalidProps(fieldErrors['new-item'])}
                            onChange={(e) => setNewItem(e.target.value)}
                          />
                        </Field>
                      </div>
                      <Button
                        type="submit"
                        variant="secondary"
                        icon={<Plus size={18} aria-hidden="true" />}
                        loading={busy === 'add'}
                      >
                        Add item
                      </Button>
                    </form>
                  )}
                </InkSection>

                <InkSection number={3} title="Operative notes" meta="Written by the clinical team">
                  {procedure.clinicalNotes.length === 0 ? (
                    <p className="py-3 text-[13px] text-fg-muted">
                      No operative notes are linked to this procedure yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {procedure.clinicalNotes.map((note) => {
                        const v = note.versions[0];
                        const sections = [
                          ['Subjective', v?.subjective],
                          ['Objective', v?.objective],
                          ['Assessment', v?.assessment],
                          ['Plan', v?.plan],
                        ].filter(([, text]) => text);
                        return (
                          <li key={note.id} className="flex flex-col gap-3 py-4">
                            <div className="flex items-center gap-3">
                              <span className="text-[13px] font-medium text-fg">
                                {humanize(note.noteType)}
                              </span>
                              <Badge tone={note.status === 'FINALIZED' ? 'success' : 'warning'}>
                                {humanize(note.status)}
                              </Badge>
                              <span className="tabular ml-auto font-mono text-[12px] text-fg-subtle">
                                {formatDate(note.createdAt)}
                              </span>
                            </div>
                            {sections.length === 0 ? (
                              <p className="text-[13px] text-fg-muted">
                                This note has no text yet.
                              </p>
                            ) : (
                              <dl className="flex flex-col gap-2 text-[13px]">
                                {sections.map(([label, text]) => (
                                  <div
                                    key={label}
                                    className="grid grid-cols-[100px_minmax(0,1fr)] gap-3"
                                  >
                                    <dt className="text-fg-muted">{label}</dt>
                                    <dd className="max-w-[72ch] whitespace-pre-wrap text-fg">
                                      {text}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </InkSection>
              </div>

              <SheetRail label="Procedure actions">
                {mayAct && (procedure.status === 'PLANNED' || procedure.status === 'SCHEDULED') && (
                  <InkSection title="Start">
                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        className="w-full"
                        disabled={missing.length > 0}
                        loading={busy === 'start'}
                        onClick={() => void act('start', 'start', {}, 'It could not be started.')}
                      >
                        Start procedure
                      </Button>
                      {missing.length > 0 ? (
                        <ul className="mt-1 flex flex-col gap-1 text-[12px] text-warning-fg">
                          {missing.map((m) => (
                            <li key={m} className="flex gap-2">
                              <span
                                aria-hidden="true"
                                className="mt-[5px] size-1.5 shrink-0 bg-current"
                              />
                              {m}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <MarginNote>Scheduled, consented and every item done.</MarginNote>
                      )}
                    </div>
                  </InkSection>
                )}
                {mayAct && procedure.status === 'IN_PROGRESS' && (
                  <InkSection title="Finish">
                    <div className="mt-3">
                      <Button
                        className="w-full"
                        loading={busy === 'complete'}
                        onClick={() =>
                          void act('complete', 'complete', {}, 'It was not completed.')
                        }
                      >
                        Complete procedure
                      </Button>
                    </div>
                  </InkSection>
                )}

                <InkSection
                  title="Details"
                  action={
                    editable ? (
                      <Button size="sm" variant="ghost" onClick={() => setDialog('estimate')}>
                        Edit estimate
                      </Button>
                    ) : undefined
                  }
                >
                  <dl className="divide-y divide-line">
                    <LedgerLine
                      label="Scheduled for"
                      value={
                        procedure.scheduledAt
                          ? `${formatDate(procedure.scheduledAt)} ${formatTime(procedure.scheduledAt)}`
                          : 'Not scheduled'
                      }
                      tone={procedure.scheduledAt ? undefined : 'muted'}
                    />
                    <LedgerLine
                      label="Doctor"
                      value={
                        <span className="font-sans">
                          {procedure.performedBy?.fullName ?? 'Not assigned'}
                        </span>
                      }
                    />
                    <LedgerLine
                      label="Location"
                      value={<span className="font-sans">{procedure.location ?? 'Not set'}</span>}
                    />
                    <LedgerLine
                      label="Estimate"
                      value={
                        procedure.estimateMinor === null
                          ? 'None'
                          : formatMoney(procedure.estimateMinor)
                      }
                    />
                  </dl>
                  {procedure.notes && (
                    <MarginNote className="mt-2 whitespace-pre-wrap">{procedure.notes}</MarginNote>
                  )}
                  {procedure.status === 'CANCELLED' && (
                    <p className="mt-2 whitespace-pre-wrap text-[13px] text-danger-fg">
                      Cancelled: {procedure.cancelReason ?? 'No reason recorded.'}
                    </p>
                  )}
                </InkSection>

                {mayAct && editable && (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setDialog('schedule')}
                    >
                      {procedure.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setDialog('cancel')}>
                      Cancel procedure
                    </Button>
                  </div>
                )}
              </SheetRail>
            </div>
          </InkSheet>

          {dialog === 'estimate' && (
            <EstimateDialog
              procedure={procedure}
              onClose={() => setDialog(undefined)}
              onSaved={detail.reload}
            />
          )}
          {dialog === 'schedule' && (
            <ScheduleDialog
              procedure={procedure}
              doctors={doctors}
              onClose={() => setDialog(undefined)}
              onSaved={detail.reload}
            />
          )}
          {dialog === 'cancel' && (
            <CancelProcedureDialog
              procedure={procedure}
              onClose={() => setDialog(undefined)}
              onSaved={detail.reload}
            />
          )}
        </>
      )}
    </div>
  );
}

/** A square tick: ink with a check when done, an outline when not. */
function CheckBox({ done }: { done: boolean }) {
  return done ? (
    <span
      aria-hidden="true"
      className="flex size-[18px] shrink-0 items-center justify-center bg-fg text-surface"
    >
      <Check size={12} weight="bold" />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="block size-[18px] shrink-0 border border-control bg-surface"
    />
  );
}
