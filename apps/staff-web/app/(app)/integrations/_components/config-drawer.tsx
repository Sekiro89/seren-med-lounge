'use client';

import { useState } from 'react';
import {
  INTEGRATION_CATALOG,
  type IntegrationField,
  type IntegrationView,
} from '@serenemed/validation';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import {
  focusFirst,
  invalidProps,
  isClean,
  isEmail,
  requiredProps,
  type FieldErrors,
  makeClearError,
} from '../../../../lib/forms';
import { connectionStatus, serverMessage, whenText } from './shared';

type Provider = keyof typeof INTEGRATION_CATALOG;
type Confirm = { kind: 'forget' } | { kind: 'clear'; field: IntegrationField };

const NO_FILL = { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' } as const;

export function ConfigDrawer({
  provider,
  view,
  onClose,
  onChanged,
}: {
  provider: Provider;
  view: IntegrationView | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const definition = INTEGRATION_CATALOG[provider];
  const fields: readonly IntegrationField[] = definition.fields;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields)
      if (!field.secret) initial[field.key] = view?.values[field.key] ?? '';
    return initial;
  });
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(view?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>();
  const [errors, setErrors] = useState<FieldErrors>({});

  const secretSet = (key: string) => view?.secrets[key]?.set === true;

  // Whether the form, as it stands, has every required field.
  const complete = fields.every((field) => {
    if (!field.required) return true;
    if (field.secret) return secretSet(field.key) || (secrets[field.key] ?? '').trim() !== '';
    return (values[field.key] ?? '').trim() !== '';
  });

  const clearError = makeClearError(setErrors, () => setError(undefined));
  const edit = (id?: string) => {
    setSaved(false);
    clearError(...(id ? [id] : []));
  };

  /** Errors are never given the secret text itself, only the field's label. */
  function validate(): FieldErrors {
    const next: FieldErrors = {};
    for (const field of fields) {
      const id = `integration-${provider}-${field.key}`;
      const raw = field.secret ? (secrets[field.key] ?? '') : (values[field.key] ?? '');
      const value = raw.trim();
      if (!value) {
        const kept = field.secret && secretSet(field.key);
        if (field.required && !kept) {
          next[id] =
            field.kind === 'select'
              ? `Choose ${field.label.toLowerCase()}.`
              : `Enter ${field.label.toLowerCase()}.`;
        }
        continue;
      }
      if (value.length > 4000) next[id] = 'Use 4000 characters or fewer.';
      else if (field.kind === 'url') {
        try {
          const url = new URL(value);
          if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('scheme');
        } catch {
          next[id] = 'Enter a full web address starting with https://.';
        }
      } else if (
        field.kind === 'select' &&
        !(field.options as readonly string[] | undefined)?.includes(value)
      ) {
        next[id] = `Choose ${field.label.toLowerCase()} from the list.`;
      } else if (field.key === 'fromAddress' && !isEmail(value)) {
        next[id] = 'Enter a valid email address, like clinic@example.com.';
      }
    }
    return next;
  }

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      after?.();
      onChanged();
    } catch (err) {
      setError(serverMessage(err, 'This could not be saved. Try again.'));
    } finally {
      setBusy(false);
      setConfirm(undefined);
    }
  }

  const save = () => {
    if (busy) return;
    const next = validate();
    setErrors(next);
    if (!isClean(next)) {
      setError(undefined);
      return focusFirst(
        next,
        fields.map((f) => `integration-${provider}-${f.key}`),
      );
    }
    return run(
      () => {
        const body: Record<string, string> = { ...values };
        for (const field of fields) {
          const typed = secrets[field.key]?.trim();
          if (field.secret && typed) body[field.key] = typed;
        }
        return apiClient.request(`/integrations/${provider}`, {
          method: 'PUT',
          body: JSON.stringify({ values: body, enabled: complete ? enabled : false }),
        });
      },
      () => {
        setSecrets({});
        setSaved(true);
      },
    );
  };

  const clearSecret = (field: IntegrationField) =>
    run(
      () =>
        apiClient.request(`/integrations/${provider}`, {
          method: 'PUT',
          body: JSON.stringify({ values: {}, clear: [field.key] }),
        }),
      () => setSaved(false),
    );

  const forget = () =>
    run(() => apiClient.request(`/integrations/${provider}`, { method: 'DELETE' }), onClose);

  const status = connectionStatus(view);
  const fieldId = (key: string) => `integration-${provider}-${key}`;

  return (
    <>
      <Dialog
        open
        variant="drawer"
        onClose={onClose}
        title={definition.label}
        description={definition.description}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              className="text-danger-fg"
              disabled={busy || !view?.updatedAt}
              onClick={() => setConfirm({ kind: 'forget' })}
            >
              Remove connection
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button loading={busy} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        }
      >
        <form
          className="flex flex-col gap-6"
          autoComplete="off"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={status.tone}>{status.label}</Badge>
            {view?.updatedAt && (
              <span className="text-[13px] text-fg-subtle">
                Last changed {whenText(view.updatedAt)}
                {view.updatedBy ? ` by ${view.updatedBy}` : ''}
              </span>
            )}
          </div>

          {fields.map((field) => {
            const id = fieldId(field.key);
            const label = field.required ? `${field.label} *` : `${field.label} (optional)`;
            const fieldError = errors[id];
            const ariaProps = {
              ...(field.required ? requiredProps : {}),
              ...invalidProps(fieldError),
            };

            if (field.secret) {
              const isSet = secretSet(field.key);
              const hint = view?.secrets[field.key]?.hint;
              return (
                <Field
                  key={field.key}
                  label={label}
                  htmlFor={id}
                  error={fieldError}
                  helper={
                    isSet
                      ? 'Saved. Type a new value to replace it, or leave this empty to keep it.'
                      : field.helper
                  }
                >
                  <Input
                    id={id}
                    name={`${provider}-${field.key}-secret`}
                    type="password"
                    value={secrets[field.key] ?? ''}
                    onChange={(event) => {
                      edit(id);
                      setSecrets({ ...secrets, [field.key]: event.target.value });
                    }}
                    {...NO_FILL}
                    {...ariaProps}
                    spellCheck={false}
                  />
                  {isSet && (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[13px] text-fg-muted">
                        <Badge tone="success">Saved</Badge>
                        <span className="tabular font-mono">{hint ?? ''}</span>
                      </span>
                      <span className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => document.getElementById(id)?.focus()}
                        >
                          Replace
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger-fg"
                          disabled={busy}
                          onClick={() => setConfirm({ kind: 'clear', field })}
                        >
                          Remove
                        </Button>
                      </span>
                    </div>
                  )}
                </Field>
              );
            }

            return (
              <Field
                key={field.key}
                label={label}
                htmlFor={id}
                helper={field.helper}
                error={fieldError}
              >
                {field.kind === 'select' ? (
                  <Select
                    id={id}
                    value={values[field.key] ?? ''}
                    {...ariaProps}
                    onChange={(event) => {
                      edit(id);
                      setValues({ ...values, [field.key]: event.target.value });
                    }}
                  >
                    <option value="">Choose one</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={id}
                    name={`${provider}-${field.key}`}
                    type={field.kind === 'url' ? 'url' : 'text'}
                    value={values[field.key] ?? ''}
                    onChange={(event) => {
                      edit(id);
                      setValues({ ...values, [field.key]: event.target.value });
                    }}
                    {...NO_FILL}
                    {...ariaProps}
                  />
                )}
              </Field>
            );
          })}

          <div className="border-t border-line pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span id="enable-label" className="text-sm font-medium text-fg">
                  Switch this connection on
                </span>
                <p id="enable-help" className="mt-1 text-[13px] text-fg-subtle">
                  {complete
                    ? 'Nothing is tested yet. Switching on only records that the clinic intends to use it.'
                    : 'Fill in every required field to switch this on.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled && complete}
                aria-labelledby="enable-label"
                aria-describedby="enable-help"
                disabled={!complete || busy}
                onClick={() => {
                  edit();
                  setEnabled(!enabled);
                }}
                className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  enabled && complete ? 'bg-primary' : 'bg-control'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-surface transition-transform ${
                    enabled && complete ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
            >
              {error}
            </p>
          )}
          {saved && !error && (
            <p
              role="status"
              className="rounded-control bg-success-bg px-3 py-2 text-sm text-success-fg"
            >
              Saved. The key is stored encrypted and can&apos;t be shown again.
            </p>
          )}
        </form>
      </Dialog>

      <Dialog
        open={confirm !== undefined}
        onClose={() => setConfirm(undefined)}
        title={confirm?.kind === 'clear' ? `Remove ${confirm.field.label}` : 'Remove connection'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => (confirm?.kind === 'clear' ? clearSecret(confirm.field) : forget())}
            >
              {confirm?.kind === 'clear' ? 'Remove key' : 'Remove connection'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirm?.kind === 'clear'
            ? `This deletes the saved ${confirm.field.label.toLowerCase()} for ${definition.label}. You will need to enter it again to use this connection.`
            : `This deletes every saved key and setting for ${definition.label}. It cannot be undone, and you will need to enter them again to reconnect.`}
        </p>
      </Dialog>
    </>
  );
}
