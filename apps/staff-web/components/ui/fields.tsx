import { isValidElement } from 'react';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/** Full width unless the caller sets its own width (a class starting with w-). */
const fullWidthUnlessSet = (className: string) => (/(^|\s)w-/.test(className) ? '' : 'w-full');

const CONTROL =
  'rounded-control border border-control bg-surface px-3 text-base text-fg placeholder:text-fg-subtle disabled:opacity-60';

/**
 * Label above, helper and error below (design system section 10). The
 * control is passed as children so any input type can sit inside it.
 */
export function Field({
  label,
  htmlFor,
  helper,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  helper?: string;
  error?: string;
  children: ReactNode;
}) {
  const childProps = isValidElement(children)
    ? (children.props as { required?: boolean; 'aria-required'?: boolean | 'true' | 'false' })
    : {};
  const isRequired =
    label.endsWith(' *') ||
    !!childProps.required ||
    childProps['aria-required'] === true ||
    childProps['aria-required'] === 'true';
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-fg">
        {label.replace(/ \*$/, '')}
        {isRequired && (
          <span aria-hidden="true" className="ml-0.5 text-danger-fg">
            *
          </span>
        )}
      </label>
      {children}
      {helper && !error && <p className="mt-2 text-[13px] text-fg-subtle">{helper}</p>}
      {error && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] text-danger-fg">
          <WarningCircle size={16} aria-hidden="true" className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={`h-10 ${fullWidthUnlessSet(className)} ${CONTROL} ${className}`} {...props} />
  );
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-10 cursor-pointer ${fullWidthUnlessSet(className)} ${CONTROL} ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-24 py-2 ${fullWidthUnlessSet(className)} ${CONTROL} ${className}`}
      {...props}
    />
  );
}
