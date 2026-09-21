import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'bg-transparent text-slate-900 hover:bg-slate-100',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const classes = [
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
    'transition-colors disabled:opacity-50 disabled:pointer-events-none',
    VARIANT_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} {...props} />;
}
