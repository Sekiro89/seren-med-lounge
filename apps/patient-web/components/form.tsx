'use client';

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const CONTROL =
  'w-full rounded-xl border border-control bg-surface px-4 text-lg text-fg placeholder:text-fg-subtle aria-[invalid=true]:border-danger-fg disabled:opacity-60';

/**
 * Label above, hint and error below; required fields carry a visible
 * marker and aria-required. Errors say what to do, in plain words.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block font-semibold text-fg">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-danger-fg">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="mt-2 text-[0.88rem] text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="mt-2 text-[0.88rem] font-semibold text-danger-fg"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Works with react-hook-form's register() (React 19 passes ref as a prop). */
export function TextInput({
  invalid,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && props.id ? `${props.id}-error` : undefined}
      className={`h-13 ${CONTROL} ${className}`}
    />
  );
}

export function TextArea({
  invalid,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && props.id ? `${props.id}-error` : undefined}
      className={`min-h-32 py-3 ${CONTROL} ${className}`}
    />
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 font-semibold text-danger-fg">
      {message}
    </p>
  );
}

/** Pulls the API's message out of an error body, or falls back. */
export function apiMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}
