'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Check, ClockCounterClockwise, Plus, SealCheck } from '@phosphor-icons/react';
import type { StaffRole } from '@serenemed/types';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Select, Textarea } from '../../../../components/ui/fields';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, humanize } from '../../../../lib/format';
import { invalidProps, type FieldErrors } from '../../../../lib/forms';
import { can } from '../../../../lib/permissions';
import { useApi } from '../../../../lib/use-api';
import { DocRow, LinkButton, SectionHeading } from './document';
import { apiErrorMessage, isUnsigned, type ClinicalNote, type ClinicalNoteVersion } from './types';

const NOTE_TYPES = ['CONSULTATION', 'PROGRESS', 'OPERATIVE', 'DISCHARGE_SUMMARY'] as const;
type NoteType = (typeof NOTE_TYPES)[number];

export const SOAP = [
  { key: 'subjective', label: 'Subjective', hint: 'What the patient reports' },
  { key: 'objective', label: 'Objective', hint: 'What you find on examination' },
  { key: 'assessment', label: 'Assessment', hint: 'Your assessment' },
  { key: 'plan', label: 'Plan', hint: 'What happens next' },
] as const;
export type SoapKey = (typeof SOAP)[number]['key'];
type SoapText = Record<SoapKey, string>;

const SOAP_MAX = 5000;
const EMPTY_SOAP: SoapText = { subjective: '', objective: '', assessment: '', plan: '' };

interface TemplateSummary {
  id: string;
  name: string;
  noteType: string;
  specialty: string | null;
  currentVersion: number;
  currentVersionId: string | null;
}

interface TemplateSection {
  prompt?: string;
  defaultText?: string;
}

interface TemplateVersion {
  id: string;
  version: number;
  body: { sections: Partial<Record<SoapKey, TemplateSection>> };
}

function isSigned(status: string): boolean {
  return status === 'FINALIZED' || status === 'AMENDED';
}

function textOf(version: ClinicalNoteVersion | undefined): SoapText {
  if (!version) return EMPTY_SOAP;
  return {
    subjective: version.subjective ?? '',
    objective: version.objective ?? '',
    assessment: version.assessment ?? '',
    plan: version.plan ?? '',
  };
}

/** Status chip wording for a note: Draft / Signed / Amended, never colour alone. */
export function NoteStatus({ status }: { status: string }) {
  if (isUnsigned(status)) return <Badge tone="warning">Draft, not signed</Badge>;
  if (status === 'AMENDED') return <Badge tone="info">Amended</Badge>;
  if (status === 'FINALIZED') return <Badge tone="success">Signed</Badge>;
  return <Badge tone="neutral">{humanize(status)}</Badge>;
}

function SoapList({
  version,
  className = '',
}: {
  version: ClinicalNoteVersion;
  className?: string;
}) {
  const parts = SOAP.filter(({ key }) => version[key]);
  if (parts.length === 0) return <p className={`text-fg-muted ${className}`}>No content yet.</p>;
  return (
    <dl className={`grid grid-cols-1 gap-1 text-fg ${className}`}>
      {parts.map(({ key, label }) => (
        <div key={key}>
          <dt className="inline text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {label}{' '}
          </dt>
          <dd className="inline whitespace-pre-wrap">{version[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The server's message for a 400 or 409; otherwise a plain fallback. */
function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

/**
 * The note the document is built around: an unsigned consultation note
 * first, then any unsigned note, then the newest consultation note, then
 * whatever note exists. Other notes are listed under "Other records".
 */
export function pickPrimaryNote(notes: ClinicalNote[]): ClinicalNote | undefined {
  const consult = notes.filter((n) => n.noteType === 'CONSULTATION');
  return (
    consult.find((n) => isUnsigned(n.status)) ??
    notes.find((n) => isUnsigned(n.status)) ??
    consult[0] ??
    notes[0]
  );
}

export type SectionState = 'editing' | 'unsaved' | 'draft' | 'done' | 'empty';

export interface NoteDraft {
  note: ClinicalNote | undefined;
  latest: ClinicalNoteVersion | undefined;
  text: SoapText;
  /** The four sections are text boxes right now. */
  editable: boolean;
  canWrite: boolean;
  canSign: boolean;
  /** A signed note is being amended in place. */
  amending: boolean;
  dirty: boolean;
  busy: boolean;
  focused: SoapKey | null;
  errors: FieldErrors;
  error: string | undefined;
  prompts: Partial<Record<SoapKey, string>>;
  templateId: string;
  templateOptions: TemplateSummary[];
  templatesLoading: boolean;
  templateBusy: boolean;
  /** Name of the template the note was started from, when it can be told. */
  templateName: string | undefined;
  setFocused: (key: SoapKey | null) => void;
  edit: (key: SoapKey, value: string) => void;
  pickTemplate: (id: string) => Promise<void>;
  startAmend: () => void;
  cancelAmend: () => void;
  /** Saves the edits (create or new version). Resolves to the note id, or null on failure. */
  save: () => Promise<string | null>;
  sectionState: (key: SoapKey) => SectionState;
}

/**
 * State for the consultation note edited in place. Creating posts a new
 * CONSULTATION draft (optionally from a template); saving an existing
 * note posts a new version through /amend, exactly as the old dialog did:
 * a draft gets a new draft version, a signed note gets an amendment.
 */
export function useNoteDraft({
  encounterId,
  notes,
  role,
  closed,
  onChange,
}: {
  encounterId: string;
  notes: ClinicalNote[];
  role: StaffRole | undefined;
  closed: boolean;
  onChange: () => void;
}): NoteDraft {
  const note = pickPrimaryNote(notes);
  const latest = note?.versions[0];
  const canWrite = !closed && can(role, 'clinical-note:write-draft');
  const canSign = !closed && can(role, 'clinical-note:sign-off');

  const [text, setText] = useState<SoapText>(() => textOf(latest));
  const [dirty, setDirty] = useState(false);
  const [amending, setAmending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<SoapKey | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [templateId, setTemplateId] = useState('');
  const [prompts, setPrompts] = useState<Partial<Record<SoapKey, string>>>({});
  const [templateBusy, setTemplateBusy] = useState(false);

  // When a reload brings a new version (ours or someone else's), start
  // from it, unless the doctor has unsaved text in the boxes.
  const baseId = latest?.id ?? 'none';
  const [syncedId, setSyncedId] = useState(baseId);
  if (syncedId !== baseId) {
    setSyncedId(baseId);
    if (!dirty) setText(textOf(latest));
  }

  const signed = !!note && isSigned(note.status);
  const editable = canWrite && (!note || !signed || amending);

  // Templates only matter while starting a note; the list is the same one
  // the old "New note" dialog used.
  const templates = useApi<TemplateSummary[]>(
    canWrite && !note ? '/clinical-templates?noteType=CONSULTATION&active=true' : null,
  );
  const templateOptions = templates.data ?? [];
  // The API sends the template a note was started from, version included.
  const templateName = note?.templateVersion
    ? `${note.templateVersion.template.name} v${note.templateVersion.version}`
    : note
      ? undefined
      : templateOptions.find((t) => t.id === templateId)?.name;

  const edit = (key: SoapKey, value: string) => {
    setText((t) => ({ ...t, [key]: value }));
    setDirty(true);
    setErrors({});
    setError(undefined);
  };

  const pickTemplate = async (id: string) => {
    setTemplateId(id);
    setErrors({});
    setError(undefined);
    const template = templateOptions.find((t) => t.id === id);
    if (!template) {
      setPrompts({});
      return;
    }
    setTemplateBusy(true);
    try {
      const version = await apiClient.get<TemplateVersion>(
        `/clinical-templates/${template.id}/versions/${template.currentVersion}`,
      );
      const sections = version.body?.sections ?? {};
      const nextPrompts: Partial<Record<SoapKey, string>> = {};
      setText((current) => {
        const next = { ...current };
        for (const { key } of SOAP) {
          const section = sections[key];
          if (section?.prompt) nextPrompts[key] = section.prompt;
          // Default text fills an empty box; what the doctor already typed stays.
          if (section?.defaultText && !current[key].trim()) next[key] = section.defaultText;
        }
        return next;
      });
      setPrompts(nextPrompts);
      setDirty(true);
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not load that template.'));
    } finally {
      setTemplateBusy(false);
    }
  };

  const save = async (): Promise<string | null> => {
    if (busy || templateBusy) return null;
    if (!dirty) return note?.id ?? null;
    const next: FieldErrors = {};
    const content: Partial<SoapText> = {};
    for (const { key, label } of SOAP) {
      const value = text[key].trim();
      if (value.length > SOAP_MAX) next[key] = `${label} can be at most ${SOAP_MAX} characters.`;
      if (value) content[key] = value;
    }
    if (Object.keys(content).length === 0) {
      next.form = 'Write something in at least one of the four sections.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    setBusy(true);
    setError(undefined);
    try {
      let id: string;
      if (note) {
        await apiClient.post(`/clinical-notes/${note.id}/amend`, content);
        id = note.id;
      } else {
        const created = await apiClient.post<{ id: string }>('/clinical-notes', {
          encounterId,
          noteType: 'CONSULTATION',
          templateVersionId:
            templateOptions.find((t) => t.id === templateId)?.currentVersionId ?? undefined,
          ...content,
        });
        id = created.id;
      }
      setDirty(false);
      setAmending(false);
      onChange();
      return id;
    } catch (e) {
      setError(
        apiErrorMessage(
          e,
          note && signed ? 'Could not amend this note.' : 'Could not save this note.',
        ),
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sectionState = (key: SoapKey): SectionState => {
    if (focused === key && editable) return 'editing';
    const saved = latest?.[key] ?? '';
    if (dirty && text[key] !== saved) return 'unsaved';
    if (!text[key].trim()) return 'empty';
    if (note && signed && !amending) return 'done';
    return 'draft';
  };

  return {
    note,
    latest,
    text,
    editable,
    canWrite,
    canSign,
    amending,
    dirty,
    busy,
    focused,
    errors,
    error,
    prompts,
    templateId,
    templateOptions,
    templatesLoading: templates.loading,
    templateBusy,
    templateName,
    setFocused,
    edit,
    pickTemplate,
    startAmend: () => setAmending(true),
    cancelAmend: () => {
      setAmending(false);
      setDirty(false);
      setErrors({});
      setError(undefined);
      setText(textOf(latest));
    },
    save,
    sectionState,
  };
}

/** Confirmation for signing off one note (design system 8.4: names the patient). */
function SignNoteDialog({
  note,
  patientName,
  onClose,
  onSigned,
}: {
  note: ClinicalNote;
  patientName: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const signOff = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/clinical-notes/${note.id}/sign-off`);
      onClose();
      onSigned();
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not sign off this note.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title="Sign off note"
      description={`This finalizes the ${humanize(note.noteType).toLowerCase()} note for ${patientName}. Later changes are recorded as amendments; the signed version stays on record.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep as draft
          </Button>
          <Button loading={busy} onClick={signOff}>
            Sign off note
          </Button>
        </>
      }
    >
      {note.versions[0] && <SoapList version={note.versions[0]} className="text-sm" />}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger-fg">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/**
 * One editor for both "New note" and "Amend" of notes other than the
 * consultation note in the document. A new note may start from a
 * template of the same type. Amending never uses a template.
 */
function NoteEditorDialog({
  encounterId,
  amending,
  onClose,
  onSaved,
}: {
  encounterId: string;
  /** Set when amending a signed note; the editor starts from its latest text. */
  amending: ClinicalNote | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const latest = amending?.versions[0];
  const amendingSigned = amending ? isSigned(amending.status) : false;
  const [noteType, setNoteType] = useState<NoteType>(
    (amending?.noteType as NoteType | undefined) ?? 'PROGRESS',
  );
  const [templateId, setTemplateId] = useState('');
  const [text, setText] = useState<SoapText>(() => textOf(latest));
  const [prompts, setPrompts] = useState<Partial<Record<SoapKey, string>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  const templates = useApi<TemplateSummary[]>(
    amending ? null : `/clinical-templates?noteType=${noteType}&active=true`,
  );
  const templateOptions = templates.data ?? [];
  const chosenTemplate = templateOptions.find((t) => t.id === templateId);

  const edit = (key: SoapKey, value: string) => {
    setText((t) => ({ ...t, [key]: value }));
    setErrors({});
    setError(undefined);
  };

  const pickTemplate = async (id: string) => {
    setTemplateId(id);
    setErrors({});
    setError(undefined);
    const template = templateOptions.find((t) => t.id === id);
    if (!template) {
      setPrompts({});
      return;
    }
    setTemplateBusy(true);
    try {
      const version = await apiClient.get<TemplateVersion>(
        `/clinical-templates/${template.id}/versions/${template.currentVersion}`,
      );
      const sections = version.body?.sections ?? {};
      const nextPrompts: Partial<Record<SoapKey, string>> = {};
      setText((current) => {
        const next = { ...current };
        for (const { key } of SOAP) {
          const section = sections[key];
          if (section?.prompt) nextPrompts[key] = section.prompt;
          if (section?.defaultText && !current[key].trim()) next[key] = section.defaultText;
        }
        return next;
      });
      setPrompts(nextPrompts);
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not load that template.'));
    } finally {
      setTemplateBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || templateBusy) return;
    const next: FieldErrors = {};
    const content: Partial<SoapText> = {};
    for (const { key, label } of SOAP) {
      const value = text[key].trim();
      if (value.length > SOAP_MAX) next[key] = `${label} can be at most ${SOAP_MAX} characters.`;
      if (value) content[key] = value;
    }
    if (Object.keys(content).length === 0) {
      next.form = 'Write something in at least one of the four sections.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setError(undefined);
    try {
      if (amending) {
        await apiClient.post(`/clinical-notes/${amending.id}/amend`, content);
      } else {
        await apiClient.post('/clinical-notes', {
          encounterId,
          noteType,
          templateVersionId: chosenTemplate?.currentVersionId ?? undefined,
          ...content,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(
        apiErrorMessage(e, amending ? 'Could not amend this note.' : 'Could not save this note.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={amending ? (amendingSigned ? 'Amend note' : 'Edit draft') : 'New note'}
      description={
        amending
          ? amendingSigned
            ? 'Your correction is saved as a new version. The signed version stays on record and is visible in History.'
            : 'Saved as a new draft version; the earlier text stays in History.'
          : 'Saved as a draft. A senior doctor signs it off.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="note-editor-form" loading={busy} disabled={templateBusy}>
            {amending ? 'Save amendment' : 'Save draft'}
          </Button>
        </>
      }
    >
      <form id="note-editor-form" noValidate onSubmit={submit} className="flex flex-col gap-5">
        {!amending && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Note type" htmlFor="note-type">
              <Select
                id="note-type"
                value={noteType}
                onChange={(e) => {
                  setNoteType(e.target.value as NoteType);
                  setTemplateId('');
                  setPrompts({});
                }}
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Template (optional)"
              htmlFor="note-template"
              helper={
                templates.loading
                  ? 'Loading templates…'
                  : templateOptions.length === 0
                    ? `No active ${humanize(noteType).toLowerCase()} templates.`
                    : 'Prefills the sections below. You can still edit everything.'
              }
            >
              <Select
                id="note-template"
                value={templateId}
                disabled={templates.loading || templateOptions.length === 0 || templateBusy}
                onChange={(e) => void pickTemplate(e.target.value)}
              >
                <option value="">No template</option>
                {templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.specialty ? ` (${t.specialty})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {SOAP.map(({ key, label, hint }) => (
          <Field
            key={key}
            label={label}
            htmlFor={`note-${key}`}
            helper={prompts[key] ?? hint}
            error={errors[key]}
          >
            <Textarea
              id={`note-${key}`}
              value={text[key]}
              maxLength={SOAP_MAX}
              rows={3}
              {...invalidProps(errors[key])}
              onChange={(e) => edit(key, e.target.value)}
            />
          </Field>
        ))}

        <FormError message={errors.form ?? error} />
      </form>
    </Dialog>
  );
}

/** Version history, newest first, with who wrote each version and when. */
function HistoryDrawer({ note, onClose }: { note: ClinicalNote; onClose: () => void }) {
  const full = useApi<{ versions: (ClinicalNoteVersion & { authorId: string | null })[] }>(
    `/clinical-notes/${note.id}`,
  );
  const directory = useApi<{ id: string; fullName: string }[]>('/users/directory');
  const names = useMemo(
    () => new Map((directory.data ?? []).map((u) => [u.id, u.fullName])),
    [directory.data],
  );
  const versions = useMemo(
    () => [...(full.data?.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber),
    [full.data],
  );

  return (
    <Dialog
      open
      onClose={onClose}
      variant="drawer"
      title={`${humanize(note.noteType)} note history`}
      description="Every version is kept. Nothing is overwritten."
    >
      {full.errorStatus !== undefined && !full.loading ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger-fg">Could not load the history.</p>
          <Button variant="secondary" size="sm" onClick={full.reload}>
            Try again
          </Button>
        </div>
      ) : full.loading ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <ol className="flex flex-col divide-y divide-line border-y border-line">
          {versions.map((v) => (
            <li key={v.id} className="py-4 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="tabular font-medium text-fg">Version {v.versionNumber}</span>
                <NoteStatus status={v.status} />
              </div>
              <p className="mb-2 font-mono text-xs text-fg-muted">
                {v.authorId ? (names.get(v.authorId) ?? 'Staff member') : 'System'} ·{' '}
                {formatDate(v.createdAt)} {formatTime(v.createdAt)}
              </p>
              <SoapList version={v} />
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

const STATUS_WORD: Record<string, string> = {
  DRAFT: 'Draft',
  AI_DRAFT: 'AI draft',
  FINALIZED: 'Signed',
  AMENDED: 'Amended',
};

/**
 * The consultation note as part of the document: a header row (status,
 * version, saved time, template, history) and sections 1 to 4, written in
 * place. `margins` are the gutter notes the page derives for each section.
 */
export function ConsultationNote({
  draft,
  patientName,
  margins,
  headerMargin,
  onChange,
}: {
  draft: NoteDraft;
  patientName: string;
  margins: Partial<Record<SoapKey, ReactNode>>;
  headerMargin?: ReactNode;
  onChange: () => void;
}) {
  const [history, setHistory] = useState(false);
  const [signing, setSigning] = useState(false);
  const { note, latest, editable, canWrite } = draft;
  const signed = !!note && isSigned(note.status);

  const status = note
    ? `${STATUS_WORD[note.status] ?? humanize(note.status)} · version ${latest?.versionNumber ?? note.versions.length}`
    : canWrite
      ? 'Not saved yet'
      : 'Not written yet';

  return (
    <>
      <DocRow margin={headerMargin} marginClassName="pt-6">
        <div className="section-rule mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
          <h2 className="text-[15px] font-semibold text-fg">
            {note && note.noteType !== 'CONSULTATION'
              ? `${humanize(note.noteType)} note`
              : 'Consultation note'}
          </h2>
          <span className="text-xs text-fg-muted">{status}</span>
          {note && isUnsigned(note.status) && (
            <span className="sr-only">This note is a draft and is not signed.</span>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-muted">
            {draft.busy ? (
              'Saving…'
            ) : draft.dirty ? (
              <span className="font-medium text-warning-fg">Unsaved changes</span>
            ) : latest ? (
              <>
                <Check size={14} className="text-success-fg" aria-hidden="true" />
                {note && note.status === 'FINALIZED'
                  ? 'Signed'
                  : note && note.status === 'AMENDED'
                    ? 'Amended'
                    : 'Saved'}{' '}
                <span className="font-mono text-fg">{formatTime(latest.createdAt)}</span>
              </>
            ) : null}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
          {!note && canWrite && (
            <label className="mr-2 inline-flex items-center gap-2 text-xs text-fg-muted">
              Template
              <select
                className="h-8 cursor-pointer rounded-control border border-control bg-surface px-2 text-[13px] text-fg disabled:opacity-60"
                value={draft.templateId}
                disabled={
                  draft.templatesLoading ||
                  draft.templateOptions.length === 0 ||
                  draft.templateBusy ||
                  draft.busy
                }
                onChange={(e) => void draft.pickTemplate(e.target.value)}
              >
                <option value="">
                  {draft.templatesLoading
                    ? 'Loading templates…'
                    : draft.templateOptions.length === 0
                      ? 'No active consultation templates'
                      : 'No template'}
                </option>
                {draft.templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.specialty ? ` (${t.specialty})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {note && isUnsigned(note.status) && draft.canSign && !draft.dirty && (
            <LinkButton
              icon={<SealCheck size={16} aria-hidden="true" />}
              onClick={() => setSigning(true)}
            >
              Sign off note
            </LinkButton>
          )}
          {signed && canWrite && !draft.amending && (
            <LinkButton tone="muted" onClick={draft.startAmend}>
              Amend
            </LinkButton>
          )}
          {draft.amending && (
            <span className="text-xs text-fg-muted">
              Amending: your correction is saved as a new version; the signed one stays in History.
            </span>
          )}
          {note && (
            <LinkButton
              tone="muted"
              icon={<ClockCounterClockwise size={16} aria-hidden="true" />}
              onClick={() => setHistory(true)}
            >
              History
            </LinkButton>
          )}
        </div>
      </DocRow>

      {SOAP.map(({ key, label, hint }, index) => {
        const focused = draft.focused === key && editable;
        const value = draft.text[key];
        const errorId = `note-${key}-error`;
        return (
          <DocRow
            key={key}
            id={`sec-${key}`}
            margin={
              <>
                {focused && <p className="font-medium text-primary">Writing now</p>}
                {margins[key]}
              </>
            }
          >
            <div className="pt-4">
              <SectionHeading
                number={index + 1}
                title={label}
                active={focused}
                id={`note-${key}-label`}
              />
              {editable ? (
                <div className="pl-6">
                  {draft.prompts[key] && (
                    <p className="mb-1 text-xs text-fg-subtle">{draft.prompts[key]}</p>
                  )}
                  <textarea
                    id={`note-${key}`}
                    aria-labelledby={`note-${key}-label`}
                    aria-describedby={draft.errors[key] ? errorId : undefined}
                    {...invalidProps(draft.errors[key])}
                    value={value}
                    maxLength={SOAP_MAX}
                    rows={2}
                    placeholder={hint}
                    onFocus={() => draft.setFocused(key)}
                    onBlur={() => draft.setFocused(null)}
                    onChange={(e) => draft.edit(key, e.target.value)}
                    className={[
                      'block min-h-14 w-full resize-none bg-transparent py-1 pl-3 pr-1 text-[15px] leading-[1.6] text-fg [field-sizing:content] placeholder:text-fg-subtle',
                      'border-l-2',
                      draft.errors[key]
                        ? 'border-danger'
                        : focused
                          ? 'border-primary'
                          : 'border-line hover:border-control',
                    ].join(' ')}
                  />
                  {draft.errors[key] && (
                    <p id={errorId} role="alert" className="mt-1 text-[13px] text-danger-fg">
                      {draft.errors[key]}
                    </p>
                  )}
                </div>
              ) : (
                <p
                  className={`whitespace-pre-wrap pl-6 text-[15px] leading-[1.6] ${value ? 'text-fg' : 'text-fg-subtle'}`}
                >
                  {value || 'Nothing recorded.'}
                </p>
              )}
            </div>
          </DocRow>
        );
      })}

      {(draft.errors.form || draft.error || draft.amending) && (
        <DocRow>
          <div className="flex flex-col gap-2 pl-6 pt-3">
            <FormError message={draft.errors.form ?? draft.error} />
            {draft.amending && (
              <div className="flex gap-2">
                <Button size="sm" loading={draft.busy} onClick={() => void draft.save()}>
                  Save amendment
                </Button>
                <Button size="sm" variant="secondary" onClick={draft.cancelAmend}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </DocRow>
      )}

      {history && note && <HistoryDrawer note={note} onClose={() => setHistory(false)} />}
      {signing && note && (
        <SignNoteDialog
          note={note}
          patientName={patientName}
          onClose={() => setSigning(false)}
          onSigned={onChange}
        />
      )}
    </>
  );
}

/**
 * Every note on the visit other than the one in the document (progress,
 * operative, discharge summaries, older consultation notes), with the
 * same sign off / edit / amend / history actions, and "New note" for
 * another note type.
 */
export function OtherNotes({
  encounterId,
  notes,
  primaryId,
  role,
  patientName,
  closed,
  onChange,
}: {
  encounterId: string;
  notes: ClinicalNote[];
  primaryId: string | undefined;
  role: StaffRole | undefined;
  patientName: string;
  closed: boolean;
  onChange: () => void;
}) {
  const [editor, setEditor] = useState<{ amending: ClinicalNote | null } | null>(null);
  const [signing, setSigning] = useState<ClinicalNote | null>(null);
  const [history, setHistory] = useState<ClinicalNote | null>(null);
  const others = notes.filter((n) => n.id !== primaryId);
  const canWrite = !closed && can(role, 'clinical-note:write-draft');
  const canSign = !closed && can(role, 'clinical-note:sign-off');

  if (others.length === 0 && !canWrite) return null;

  return (
    <div className="mt-4">
      <div className="flex min-h-8 items-center justify-between border-b border-line">
        <h4 className="text-[13px] font-semibold text-fg">Other notes</h4>
        {canWrite && (
          <LinkButton
            icon={<Plus size={14} aria-hidden="true" />}
            onClick={() => setEditor({ amending: null })}
          >
            New note
          </LinkButton>
        )}
      </div>
      {others.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">
          No other notes. Progress, operative and discharge notes go here.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {others.map((note) => {
            const latest = note.versions[0];
            return (
              <li key={note.id} className="py-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{humanize(note.noteType)}</span>
                  <NoteStatus status={note.status} />
                  {latest && (
                    <span className="font-mono text-xs text-fg-subtle">
                      v{latest.versionNumber} · {formatDate(latest.createdAt)}{' '}
                      {formatTime(latest.createdAt)}
                    </span>
                  )}
                  <span className="ml-auto flex flex-wrap gap-0.5">
                    {isUnsigned(note.status) && canSign && (
                      <LinkButton onClick={() => setSigning(note)}>Sign off</LinkButton>
                    )}
                    {canWrite && (
                      <LinkButton tone="muted" onClick={() => setEditor({ amending: note })}>
                        {isSigned(note.status) ? 'Amend' : 'Edit'}
                      </LinkButton>
                    )}
                    <LinkButton tone="muted" onClick={() => setHistory(note)}>
                      History
                    </LinkButton>
                  </span>
                </div>
                {latest ? (
                  <SoapList version={latest} />
                ) : (
                  <p className="text-fg-muted">No content yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editor && (
        <NoteEditorDialog
          encounterId={encounterId}
          amending={editor.amending}
          onClose={() => setEditor(null)}
          onSaved={onChange}
        />
      )}
      {history && <HistoryDrawer note={history} onClose={() => setHistory(null)} />}
      {signing && (
        <SignNoteDialog
          note={signing}
          patientName={patientName}
          onClose={() => setSigning(null)}
          onSigned={onChange}
        />
      )}
    </div>
  );
}
