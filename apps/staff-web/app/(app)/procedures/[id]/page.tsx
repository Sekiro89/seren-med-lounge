'use client';

import { use, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  Circle,
  Plus,
  Scissors,
  WarningCircle,
} from '@phosphor-icons/react';
import { Avatar } from '../../../../components/ui/avatar';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { NoAccess } from '../../../../components/ui/no-access';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
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

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    const label = newItem.trim();
    if (!label) return setError('Write the checklist item first.');
    if (await act('add', 'checklist', { label }, 'The item was not added.')) setNewItem('');
  };

  const attach = async (event: FormEvent) => {
    event.preventDefault();
    if (!documentId.trim()) return setError('Choose the consent form to attach.');
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
    <div className="flex flex-col gap-8">
      <Link
        href="/procedures"
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All procedures
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
          <section
            aria-label="Patient and procedure"
            className="rounded-panel border border-line bg-surface shadow-card"
          >
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5">
              <Avatar name={fullName(procedure.patient)} size={48} />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold leading-8 tracking-tight text-fg">
                  {procedure.name}
                </h1>
                <p className="mt-0.5 text-sm text-fg-muted">
                  {canDocuments ? (
                    <Link
                      href={`/patients/${procedure.patient.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {fullName(procedure.patient)}
                    </Link>
                  ) : (
                    fullName(procedure.patient)
                  )}
                  <span className="tabular font-mono text-[13px] text-fg-subtle">
                    {' '}
                    {procedure.patient.id}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {procedure.kind === 'SURGERY' && <Badge tone="info">Surgery</Badge>}
                <Badge tone={STATUS_TONE[procedure.status]}>{humanize(procedure.status)}</Badge>
              </div>
            </div>
          </section>

          {!mayAct && (
            <p
              role="status"
              className="rounded-control bg-surface-muted px-4 py-3 text-sm text-fg-muted"
            >
              This is a surgery. Your role can view it but not change it.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-control bg-danger-bg px-4 py-3 text-sm text-danger-fg"
            >
              {error}
            </p>
          )}

          <Card>
            <CardHeader
              title="Details"
              action={
                mayAct && (
                  <div className="flex gap-2">
                    {editable && (
                      <Button size="sm" variant="secondary" onClick={() => setDialog('schedule')}>
                        {procedure.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
                      </Button>
                    )}
                    {procedure.status === 'IN_PROGRESS' && (
                      <Button
                        size="sm"
                        loading={busy === 'complete'}
                        onClick={() =>
                          void act('complete', 'complete', {}, 'It was not completed.')
                        }
                      >
                        Complete procedure
                      </Button>
                    )}
                    {editable && (
                      <Button size="sm" variant="ghost" onClick={() => setDialog('cancel')}>
                        Cancel procedure
                      </Button>
                    )}
                  </div>
                )
              }
            />
            <dl className="grid gap-x-8 gap-y-6 px-6 py-6 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[13px] text-fg-subtle">Scheduled for</dt>
                <dd className="tabular mt-1 text-fg">
                  {procedure.scheduledAt
                    ? `${formatDate(procedure.scheduledAt)} ${formatTime(procedure.scheduledAt)}`
                    : 'Not scheduled'}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-fg-subtle">Doctor</dt>
                <dd className="mt-1 text-fg">
                  {procedure.performedBy?.fullName ?? 'Not assigned'}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-fg-subtle">Location</dt>
                <dd className="mt-1 text-fg">{procedure.location ?? 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-fg-subtle">Estimate</dt>
                <dd className="mt-1 flex items-center gap-3 text-fg">
                  <span className="tabular">
                    {procedure.estimateMinor === null
                      ? 'None'
                      : formatMoney(procedure.estimateMinor)}
                  </span>
                  {editable && (
                    <Button size="sm" variant="ghost" onClick={() => setDialog('estimate')}>
                      Edit estimate
                    </Button>
                  )}
                </dd>
              </div>
              {procedure.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-[13px] text-fg-subtle">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-fg">{procedure.notes}</dd>
                </div>
              )}
              {procedure.status === 'CANCELLED' && (
                <div className="sm:col-span-2">
                  <dt className="text-[13px] text-fg-subtle">Cancelled</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-fg">
                    {procedure.cancelReason ?? 'No reason recorded.'}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Readiness"
              description="The procedure can start once it is scheduled, the consent form is attached and every checklist item is done."
              action={
                mayAct &&
                (procedure.status === 'PLANNED' || procedure.status === 'SCHEDULED') && (
                  <Button
                    disabled={missing.length > 0}
                    loading={busy === 'start'}
                    onClick={() => void act('start', 'start', {}, 'It could not be started.')}
                  >
                    Start procedure
                  </Button>
                )
              }
            />
            <div className="flex flex-col gap-8 px-6 py-6">
              {editable && missing.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-fg">Still missing</h3>
                  <ul className="mt-2 list-disc pl-5 text-sm text-fg-muted">
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-fg">Consent form</h3>
                <p className="mt-2 flex items-center gap-2 text-sm text-fg">
                  {procedure.consentDocumentId ? (
                    <>
                      <CheckCircle
                        size={20}
                        weight="fill"
                        aria-hidden="true"
                        className="text-success-fg"
                      />
                      {attached
                        ? `Attached: ${attached.fileName}`
                        : 'A signed consent form is attached.'}
                    </>
                  ) : (
                    <>
                      <Circle size={20} aria-hidden="true" className="text-fg-subtle" />
                      No consent form attached.
                    </>
                  )}
                </p>
                {editable && (
                  <form onSubmit={attach} className="mt-4 flex max-w-lg flex-wrap items-end gap-3">
                    <div className="min-w-56 flex-1">
                      {canDocuments ? (
                        <Field
                          label="Consent form"
                          htmlFor="consent-doc"
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
                          label="Consent form document ID"
                          htmlFor="consent-doc"
                          helper="Your role cannot list patient documents, so enter the ID of the patient's consent form."
                        >
                          <Input
                            id="consent-doc"
                            value={documentId}
                            onChange={(e) => setDocumentId(e.target.value)}
                          />
                        </Field>
                      )}
                    </div>
                    <Button
                      type="submit"
                      variant="secondary"
                      loading={busy === 'consent'}
                      disabled={!documentId}
                    >
                      Attach form
                    </Button>
                  </form>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-fg">Pre-op checklist</h3>
                {procedure.checklist.length === 0 ? (
                  <p className="mt-2 text-sm text-fg-muted">No checklist items yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {procedure.checklist.map((item) => {
                      const done = Boolean(item.completedAt);
                      return (
                        <li key={item.id} className="flex items-center gap-3 py-3">
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
                            className="size-5 cursor-pointer accent-primary"
                          />
                          <label
                            htmlFor={`item-${item.id}`}
                            className={`flex-1 text-sm ${done ? 'text-fg-muted line-through' : 'text-fg'}`}
                          >
                            {item.label}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {editable && (
                  <form onSubmit={addItem} className="mt-4 flex max-w-lg flex-wrap items-end gap-3">
                    <div className="min-w-56 flex-1">
                      <Field label="New checklist item" htmlFor="new-item">
                        <Input
                          id="new-item"
                          value={newItem}
                          maxLength={300}
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
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Operative notes" description="Written by the clinical team." />
            {procedure.clinicalNotes.length === 0 ? (
              <p className="px-6 py-6 text-sm text-fg-muted">
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
                    <li key={note.id} className="flex flex-col gap-4 px-6 py-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-fg">
                          {humanize(note.noteType)}
                        </span>
                        <Badge tone={note.status === 'FINALIZED' ? 'success' : 'warning'}>
                          {humanize(note.status)}
                        </Badge>
                        <span className="tabular text-[13px] text-fg-subtle">
                          {formatDate(note.createdAt)}
                        </span>
                      </div>
                      {sections.length === 0 ? (
                        <p className="text-sm text-fg-muted">This note has no text yet.</p>
                      ) : (
                        <dl className="flex flex-col gap-3 text-sm">
                          {sections.map(([label, text]) => (
                            <div key={label}>
                              <dt className="text-[13px] text-fg-subtle">{label}</dt>
                              <dd className="mt-1 whitespace-pre-wrap text-fg">{text}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

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
