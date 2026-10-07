'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ClockCounterClockwise, Plus } from '@phosphor-icons/react';
import type { StaffRole } from '@serenemed/types';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Select, Textarea } from '../../../../components/ui/fields';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, humanize } from '../../../../lib/format';
import { invalidProps, type FieldErrors } from '../../../../lib/forms';
import { can } from '../../../../lib/permissions';
import { useApi } from '../../../../lib/use-api';
import { apiErrorMessage, isUnsigned, type ClinicalNote, type ClinicalNoteVersion } from './types';

const NOTE_TYPES = ['CONSULTATION', 'PROGRESS', 'OPERATIVE', 'DISCHARGE_SUMMARY'] as const;
type NoteType = (typeof NOTE_TYPES)[number];

const SOAP = [
  { key: 'subjective', label: 'Subjective', hint: 'What the patient reports' },
  { key: 'objective', label: 'Objective', hint: 'What you find on examination' },
  { key: 'assessment', label: 'Assessment', hint: 'Your assessment' },
  { key: 'plan', label: 'Plan', hint: 'What happens next' },
] as const;
type SoapKey = (typeof SOAP)[number]['key'];
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

/** Status chip wording for a note: Draft / Signed / Amended, never colour alone. */
function NoteStatus({ status }: { status: string }) {
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
 * One editor for both "New note" and "Amend". A new note may start from
 * a template of the same type: picking one prefills the four SOAP boxes
 * with the template's default text and shows each section's prompt as
 * the field helper. Amending never uses a template.
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
  const amendingSigned = amending?.status === 'FINALIZED' || amending?.status === 'AMENDED';
  const [noteType, setNoteType] = useState<NoteType>(
    (amending?.noteType as NoteType | undefined) ?? 'CONSULTATION',
  );
  const [templateId, setTemplateId] = useState('');
  const [text, setText] = useState<SoapText>(() =>
    latest
      ? {
          subjective: latest.subjective ?? '',
          objective: latest.objective ?? '',
          assessment: latest.assessment ?? '',
          plan: latest.plan ?? '',
        }
      : EMPTY_SOAP,
  );
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
          // Default text fills an empty box; what the doctor already typed stays.
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
        <ol className="flex flex-col gap-4">
          {versions.map((v) => (
            <li key={v.id} className="rounded-control border border-line p-4 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="tabular font-medium text-fg">Version {v.versionNumber}</span>
                <NoteStatus status={v.status} />
              </div>
              <p className="tabular mb-2 text-xs text-fg-muted">
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

export function NotesSection({
  encounterId,
  notes,
  role,
  patientName,
  closed,
  onChange,
}: {
  encounterId: string;
  notes: ClinicalNote[];
  role: StaffRole | undefined;
  patientName: string;
  /** A discharged visit: read only. */
  closed: boolean;
  onChange: () => void;
}) {
  const [editor, setEditor] = useState<{ amending: ClinicalNote | null } | null>(null);
  const [signing, setSigning] = useState<ClinicalNote | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string>();
  const [history, setHistory] = useState<ClinicalNote | null>(null);

  const canWrite = !closed && can(role, 'clinical-note:write-draft');
  const canSign = !closed && can(role, 'clinical-note:sign-off');

  const signOff = async (note: ClinicalNote) => {
    setSignBusy(true);
    setSignError(undefined);
    try {
      await apiClient.post(`/clinical-notes/${note.id}/sign-off`);
      setSigning(null);
      onChange();
    } catch (e) {
      setSignError(apiErrorMessage(e, 'Could not sign off this note.'));
    } finally {
      setSignBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Clinical notes"
        description="Subjective, objective, assessment and plan for this visit."
        action={
          canWrite ? (
            <Button
              size="sm"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => setEditor({ amending: null })}
            >
              New note
            </Button>
          ) : undefined
        }
      />
      <div className="p-5">
        {notes.length === 0 ? (
          <p className="text-sm text-fg-muted">
            {canWrite
              ? 'No clinical notes for this visit yet. Start one with New note.'
              : 'No clinical notes for this visit.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => {
              const latest = note.versions[0];
              const signed = note.status === 'FINALIZED' || note.status === 'AMENDED';
              return (
                <li key={note.id} className="rounded-control bg-surface-muted px-4 py-3 text-sm">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg">{humanize(note.noteType)}</span>
                      <NoteStatus status={note.status} />
                      {latest && (
                        <span className="tabular text-xs text-fg-subtle">
                          Version {latest.versionNumber} · {formatDate(latest.createdAt)}{' '}
                          {formatTime(latest.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isUnsigned(note.status) && canSign && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSignError(undefined);
                            setSigning(note);
                          }}
                        >
                          Sign off
                        </Button>
                      )}
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditor({ amending: note })}
                        >
                          {signed ? 'Amend' : 'Edit'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ClockCounterClockwise size={16} aria-hidden="true" />}
                        onClick={() => setHistory(note)}
                      >
                        History
                      </Button>
                    </div>
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
      </div>

      {editor && (
        <NoteEditorDialog
          encounterId={encounterId}
          amending={editor.amending}
          onClose={() => setEditor(null)}
          onSaved={onChange}
        />
      )}

      {history && <HistoryDrawer note={history} onClose={() => setHistory(null)} />}

      <Dialog
        open={signing !== null}
        onClose={() => !signBusy && setSigning(null)}
        title="Sign off note"
        description={`This finalizes the ${signing ? humanize(signing.noteType).toLowerCase() : ''} note for ${patientName}. Later changes are recorded as amendments; the signed version stays on record.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSigning(null)} disabled={signBusy}>
              Keep as draft
            </Button>
            <Button loading={signBusy} onClick={() => signing && signOff(signing)}>
              Sign off note
            </Button>
          </>
        }
      >
        {signing?.versions[0] && <SoapList version={signing.versions[0]} className="text-sm" />}
        {signError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-fg">
            {signError}
          </p>
        )}
      </Dialog>
    </Card>
  );
}
