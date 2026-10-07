'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { humanize } from '../../../../lib/format';
import {
  clearOnEdit,
  focusFirst,
  invalidProps,
  isClean,
  makeClearError,
  req,
  requiredProps,
  type FieldErrors,
} from '../../../../lib/forms';

export const NOTE_TYPES = ['CONSULTATION', 'PROGRESS', 'OPERATIVE', 'DISCHARGE_SUMMARY'] as const;

export const SECTIONS = [
  { key: 'subjective', label: 'Subjective', hint: 'What the patient reports' },
  { key: 'objective', label: 'Objective', hint: 'What the doctor finds on examination' },
  { key: 'assessment', label: 'Assessment', hint: "The doctor's assessment" },
  { key: 'plan', label: 'Plan', hint: 'What happens next' },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];

export interface TemplateSection {
  prompt?: string;
  defaultText?: string;
}

export interface TemplateBody {
  sections: Partial<Record<SectionKey, TemplateSection>>;
  fields?: unknown[];
}

export interface TemplateRow {
  id: string;
  name: string;
  noteType: string;
  specialty: string | null;
  isActive: boolean;
  currentVersion: number;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROMPT_MAX = 1000;
const DEFAULT_MAX = 5000;

type SectionText = Record<SectionKey, { prompt: string; defaultText: string }>;

const emptySections = (): SectionText => ({
  subjective: { prompt: '', defaultText: '' },
  objective: { prompt: '', defaultText: '' },
  assessment: { prompt: '', defaultText: '' },
  plan: { prompt: '', defaultText: '' },
});

function fromBody(body: TemplateBody | null | undefined): SectionText {
  const next = emptySections();
  for (const { key } of SECTIONS) {
    next[key] = {
      prompt: body?.sections?.[key]?.prompt ?? '',
      defaultText: body?.sections?.[key]?.defaultText ?? '',
    };
  }
  return next;
}

/** Builds the API body: empty sections are left out, so the schema's strict shape holds. */
function toBody(sections: SectionText, keepFields: unknown[] | undefined): TemplateBody {
  const out: TemplateBody['sections'] = {};
  for (const { key } of SECTIONS) {
    const prompt = sections[key].prompt.trim();
    const defaultText = sections[key].defaultText.trim();
    if (prompt || defaultText) {
      out[key] = {
        ...(prompt ? { prompt } : {}),
        ...(defaultText ? { defaultText } : {}),
      };
    }
  }
  return keepFields && keepFields.length > 0
    ? { sections: out, fields: keepFields }
    : { sections: out };
}

/** The server's own message for a 400 or 409, otherwise a plain fallback. */
export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
    const message = (error.body as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      {message}
    </p>
  );
}

/** Validates the four sections; returns errors keyed by control id. */
function sectionErrors(sections: SectionText, prefix: string): FieldErrors {
  const errors: FieldErrors = {};
  let any = false;
  for (const { key, label } of SECTIONS) {
    const { prompt, defaultText } = sections[key];
    if (prompt.trim() || defaultText.trim()) any = true;
    if (prompt.length > PROMPT_MAX)
      errors[`${prefix}-${key}-prompt`] =
        `${label} prompt can be at most ${PROMPT_MAX} characters.`;
    if (defaultText.length > DEFAULT_MAX)
      errors[`${prefix}-${key}-default`] =
        `${label} default text can be at most ${DEFAULT_MAX} characters.`;
  }
  if (!any) errors[`${prefix}-sections`] = 'Fill in at least one section.';
  return errors;
}

function SectionFields({
  prefix,
  sections,
  errors,
  onChange,
}: {
  prefix: string;
  sections: SectionText;
  errors: FieldErrors;
  onChange: (key: SectionKey, part: 'prompt' | 'defaultText', value: string) => void;
}) {
  return (
    <>
      {SECTIONS.map(({ key, label, hint }) => (
        <fieldset key={key} className="rounded-control border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-fg">{label}</legend>
          <p className="mb-3 text-[13px] text-fg-subtle">{hint}</p>
          <div className="flex flex-col gap-4">
            <Field
              label="Prompt"
              htmlFor={`${prefix}-${key}-prompt`}
              helper="Shown to the doctor as a hint under this section."
              error={errors[`${prefix}-${key}-prompt`]}
            >
              <Input
                id={`${prefix}-${key}-prompt`}
                value={sections[key].prompt}
                maxLength={PROMPT_MAX}
                {...invalidProps(errors[`${prefix}-${key}-prompt`])}
                onChange={(e) => onChange(key, 'prompt', e.target.value)}
              />
            </Field>
            <Field
              label="Default text"
              htmlFor={`${prefix}-${key}-default`}
              helper="Prefilled into a new note. The doctor can change it."
              error={errors[`${prefix}-${key}-default`]}
            >
              <Textarea
                id={`${prefix}-${key}-default`}
                value={sections[key].defaultText}
                maxLength={DEFAULT_MAX}
                rows={3}
                {...invalidProps(errors[`${prefix}-${key}-default`])}
                onChange={(e) => onChange(key, 'defaultText', e.target.value)}
              />
            </Field>
          </div>
        </fieldset>
      ))}
      <p className="text-[13px] text-fg-subtle">
        Structured fields (checkboxes, dropdowns, numbers) are coming later. Templates hold section
        prompts and default text for now.
      </p>
    </>
  );
}

export function NewTemplateDialog(props: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Mounted only while open so the form starts empty every time.
  return props.open ? <NewTemplateForm {...props} /> : null;
}

function NewTemplateForm({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [noteType, setNoteType] = useState<string>('CONSULTATION');
  const [specialty, setSpecialty] = useState('');
  const [sections, setSections] = useState<SectionText>(emptySections);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const clearError = makeClearError(setErrors, () => setError(undefined));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next: FieldErrors = { ...sectionErrors(sections, 'tpl') };
    if (!name.trim()) next['tpl-name'] = 'Enter a template name.';
    else if (name.trim().length > 200) next['tpl-name'] = 'Use 200 characters or fewer.';
    if (specialty.trim().length > 100) next['tpl-specialty'] = 'Use 100 characters or fewer.';
    setErrors(next);
    if (!isClean(next)) {
      focusFirst(next, ['tpl-name', 'tpl-specialty']);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post('/clinical-templates', {
        name: name.trim(),
        noteType,
        specialty: specialty.trim() || undefined,
        body: toBody(sections, undefined),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'Could not create the template.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="New template"
      description="Doctors pick it when starting a note of this type."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="new-template-form" loading={busy}>
            Create template
          </Button>
        </>
      }
    >
      <form
        id="new-template-form"
        noValidate
        onSubmit={submit}
        onChange={clearOnEdit(clearError, {
          'tpl-subjective-prompt': ['tpl-sections'],
          'tpl-subjective-default': ['tpl-sections'],
          'tpl-objective-prompt': ['tpl-sections'],
          'tpl-objective-default': ['tpl-sections'],
          'tpl-assessment-prompt': ['tpl-sections'],
          'tpl-assessment-default': ['tpl-sections'],
          'tpl-plan-prompt': ['tpl-sections'],
          'tpl-plan-default': ['tpl-sections'],
        })}
        className="flex flex-col gap-5"
      >
        <Field label={req('Name')} htmlFor="tpl-name" error={errors['tpl-name']}>
          <Input
            id="tpl-name"
            value={name}
            maxLength={200}
            {...requiredProps}
            {...invalidProps(errors['tpl-name'])}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={req('Note type')} htmlFor="tpl-type">
            <Select
              id="tpl-type"
              value={noteType}
              {...requiredProps}
              onChange={(e) => setNoteType(e.target.value)}
            >
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Specialty"
            htmlFor="tpl-specialty"
            helper="For example Cardiology. Leave blank for all."
            error={errors['tpl-specialty']}
          >
            <Input
              id="tpl-specialty"
              value={specialty}
              maxLength={100}
              {...invalidProps(errors['tpl-specialty'])}
              onChange={(e) => setSpecialty(e.target.value)}
            />
          </Field>
        </div>
        <SectionFields
          prefix="tpl"
          sections={sections}
          errors={errors}
          onChange={(key, part, value) =>
            setSections((s) => ({ ...s, [key]: { ...s[key], [part]: value } }))
          }
        />
        <FormError message={errors['tpl-sections'] ?? error} />
      </form>
    </Dialog>
  );
}

export function NewVersionDialog({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Mounted only while a template is chosen so the form reloads for each one.
  return template ? (
    <NewVersionForm template={template} onClose={onClose} onSaved={onSaved} />
  ) : null;
}

function NewVersionForm({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState<{ body: TemplateBody | null } | 'error'>();
  const [sections, setSections] = useState<SectionText>(emptySections);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const clearError = makeClearError(setErrors, () => setError(undefined));

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ body: TemplateBody | null }>(`/clinical-templates/${template.id}`)
      .then((t) => {
        if (cancelled) return;
        setLoaded({ body: t.body });
        setSections(fromBody(t.body));
      })
      .catch(() => {
        if (!cancelled) setLoaded('error');
      });
    return () => {
      cancelled = true;
    };
  }, [template.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !loaded || loaded === 'error') return;
    const next = sectionErrors(sections, 'ver');
    setErrors(next);
    if (!isClean(next)) return;
    setBusy(true);
    setError(undefined);
    try {
      const keepFields = Array.isArray(loaded.body?.fields) ? loaded.body?.fields : undefined;
      await apiClient.post(`/clinical-templates/${template.id}/versions`, {
        body: toBody(sections, keepFields),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'Could not save the new version.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={`New version of ${template.name}`}
      description={`Starts from version ${template.currentVersion}. Notes already written keep the version they used.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-version-form"
            loading={busy}
            disabled={!loaded || loaded === 'error'}
          >
            Publish version {template.currentVersion + 1}
          </Button>
        </>
      }
    >
      {loaded === undefined ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : loaded === 'error' ? (
        <p role="alert" className="text-sm text-danger-fg">
          Could not load the current version. Close and try again.
        </p>
      ) : (
        <form
          id="new-version-form"
          noValidate
          onSubmit={submit}
          onChange={clearOnEdit(clearError, {
            'ver-subjective-prompt': ['ver-sections'],
            'ver-subjective-default': ['ver-sections'],
            'ver-objective-prompt': ['ver-sections'],
            'ver-objective-default': ['ver-sections'],
            'ver-assessment-prompt': ['ver-sections'],
            'ver-assessment-default': ['ver-sections'],
            'ver-plan-prompt': ['ver-sections'],
            'ver-plan-default': ['ver-sections'],
          })}
          className="flex flex-col gap-5"
        >
          <SectionFields
            prefix="ver"
            sections={sections}
            errors={errors}
            onChange={(key, part, value) =>
              setSections((s) => ({ ...s, [key]: { ...s[key], [part]: value } }))
            }
          />
          <FormError message={errors['ver-sections'] ?? error} />
        </form>
      )}
    </Dialog>
  );
}

/** Activate or deactivate with a confirm; the verb is repeated on the button. */
export function ToggleActiveDialog({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const deactivating = template?.isActive ?? false;

  const confirm = async () => {
    if (!template) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(
        `/clinical-templates/${template.id}/${deactivating ? 'deactivate' : 'activate'}`,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(messageOf(e, 'Could not change this template.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={template !== undefined}
      onClose={() => !busy && onClose()}
      title={deactivating ? 'Deactivate template' : 'Activate template'}
      description={
        deactivating
          ? 'Doctors will no longer see it when starting a note. Notes already written from it are not affected.'
          : 'Doctors will see it when starting a note of this type.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={deactivating ? 'danger' : 'primary'} loading={busy} onClick={confirm}>
            {deactivating ? 'Deactivate template' : 'Activate template'}
          </Button>
        </>
      }
    >
      {template && (
        <p className="text-sm text-fg">
          <span className="font-medium">{template.name}</span> · {humanize(template.noteType)}
          {template.specialty ? ` · ${template.specialty}` : ''}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger-fg">
          {error}
        </p>
      )}
    </Dialog>
  );
}
