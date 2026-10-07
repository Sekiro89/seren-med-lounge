import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const CONTROL =
  'w-full rounded-control border border-control bg-surface px-3 text-base text-fg placeholder:text-fg-subtle disabled:opacity-60';

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
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {helper && !error && <p className="mt-1.5 text-[13px] text-fg-subtle">{helper}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-[13px] text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-10 ${CONTROL} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`h-10 cursor-pointer ${CONTROL} ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-24 py-2 ${CONTROL} ${className}`} {...props} />;
}
