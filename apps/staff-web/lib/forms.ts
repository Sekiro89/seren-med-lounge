/**
 * Small helpers for pre-submit form validation (design system section 10).
 * Each form keeps a `FieldErrors` map, fills it on submit and passes each
 * entry to <Field error>. The Zod schemas stay the source of truth for the
 * server rules; these cover the format checks the UI adds on top.
 */
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { FieldValues, Path, UseFormClearErrors } from 'react-hook-form';
import type { ZodError } from 'zod';

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

/** Marks a Field label as mandatory. */
export const req = (label: string) => `${label} *`;

/** Props for a mandatory control. Native `required` is not used: forms are `noValidate`. */
export const requiredProps = { 'aria-required': true } as const;

/** `aria-invalid` for a control, driven by its error. */
export const invalidProps = (error: string | undefined) =>
  error ? ({ 'aria-invalid': true } as const) : ({} as const);

/** Moves focus to the first control (by id) that has an error. */
export function focusFirst(errors: FieldErrors, order: string[]): void {
  const first = order.find((id) => errors[id]);
  if (first) window.setTimeout(() => document.getElementById(first)?.focus(), 0);
}

/** Returns `errors` without `keys`; the same object when none were set, so React skips the render. */
export function withoutErrors(errors: FieldErrors, keys: string[]): FieldErrors {
  if (!keys.some((k) => errors[k] !== undefined)) return errors;
  const next = { ...errors };
  for (const k of keys) delete next[k];
  return next;
}

/**
 * Builds `clearError(...keys)`: drops those inline errors (and runs `onEdit`,
 * normally the form-level server error reset) as soon as a field is edited.
 * Called with no keys it only runs `onEdit`. It never re-validates.
 */
export function makeClearError(
  setErrors: Dispatch<SetStateAction<FieldErrors>>,
  onEdit?: () => void,
) {
  return (...keys: string[]) => {
    if (keys.length) setErrors((prev) => withoutErrors(prev, keys));
    onEdit?.();
  };
}

/**
 * Form-level `onChange` that clears the error of the edited control (matched by
 * its id). `groups` maps a control id to extra error keys cleared with it, for
 * group errors such as "add at least one row".
 */
export function clearOnEdit(
  clearError: (...keys: string[]) => void,
  groups: Record<string, string[]> = {},
) {
  return (event: FormEvent<HTMLElement>) => {
    const id = (event.target as HTMLElement).id;
    clearError(...(id ? [id, ...(groups[id] ?? [])] : []));
  };
}

/**
 * Same idea for react-hook-form forms: a form-level `onChange` that clears the
 * edited control's error (by its registered `name`, plus any `groups` extras)
 * and runs `onEdit`, normally the form-level server error reset.
 */
export function clearOnEditRhf<V extends FieldValues>(
  clearErrors: UseFormClearErrors<V>,
  onEdit?: () => void,
  groups: Record<string, string[]> = {},
) {
  return (event: FormEvent<HTMLElement>) => {
    const name = (event.target as HTMLInputElement).name;
    // '*' lists keys cleared by any edit, such as the form-wide '' key of a refine() rule.
    const keys = [...(name ? [name, ...(groups[name] ?? [])] : []), ...(groups['*'] ?? [])];
    if (keys.length) clearErrors(keys as Path<V>[]);
    onEdit?.();
  };
}

/** Clears named errors of a react-hook-form form, for keys the field types do not list (such as `items.root`). */
export function clearKeysRhf<V extends FieldValues>(
  clearErrors: UseFormClearErrors<V>,
  keys: string[],
) {
  clearErrors(keys as Path<V>[]);
}

/** True when the map holds no errors. */
export const isClean = (errors: FieldErrors) => Object.keys(errors).length === 0;

/**
 * Maps Zod issues to field errors, keyed by the first path segment (or by
 * `pathMap` when the form's control ids differ). Only the first issue per
 * field is kept.
 */
export function issuesToErrors(
  error: ZodError,
  pathMap: Record<string, string> = {},
  messages: Record<string, string> = {},
): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const head = String(issue.path[0] ?? '_');
    const key = pathMap[head] ?? head;
    if (!out[key]) out[key] = messages[head] ?? issue.message;
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL.test(value.trim());

/** 7 to 20 characters (the schema), made of digits with an optional leading + and common separators. */
export function phoneError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Enter a phone number.';
  if (!/^\+?[0-9][0-9\s-]*$/.test(v)) return 'Use digits only, with an optional + at the start.';
  const digits = v.replace(/\D/g, '').length;
  if (digits < 7) return 'Enter at least 7 digits.';
  if (v.length > 20) return 'Use 20 characters or fewer.';
  return undefined;
}

/** Optional email: empty is fine, otherwise it must look like an address. */
export const emailError = (value: string): string | undefined =>
  value.trim() && !isEmail(value)
    ? 'Enter a valid email address, like name@example.com.'
    : undefined;

/** A positive whole number, as text from an input. */
export function positiveIntError(value: string, label: string, max?: number): string | undefined {
  const v = value.trim();
  if (!v) return `Enter ${label}.`;
  if (!/^\d+$/.test(v))
    return `${label[0]!.toUpperCase()}${label.slice(1)} must be a whole number.`;
  const n = Number(v);
  if (n <= 0) return `${label[0]!.toUpperCase()}${label.slice(1)} must be more than zero.`;
  if (max !== undefined && n > max) return `Use ${max.toLocaleString('en-IN')} or fewer.`;
  return undefined;
}

/** Rupee amount as text: empty allowed only when `optional`; otherwise a number >= 0 (or > 0 with `positive`). */
export function rupeesError(
  value: string,
  opts: { optional?: boolean; positive?: boolean; label?: string; maxMinor?: number } = {},
): string | undefined {
  const v = value.trim();
  const label = opts.label ?? 'an amount';
  if (!v) return opts.optional ? undefined : `Enter ${label} in rupees.`;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'Use a number of rupees with up to 2 decimals.';
  const n = Number(v);
  if (opts.positive && n <= 0) return 'The amount must be more than zero.';
  if (opts.maxMinor !== undefined && Math.round(n * 100) > opts.maxMinor) {
    return 'That amount is too large.';
  }
  return undefined;
}

/** Past dates (before today in `today`, a YYYY-MM-DD string) are rejected. */
export const isPastDate = (value: string, today: string) => value < today;
