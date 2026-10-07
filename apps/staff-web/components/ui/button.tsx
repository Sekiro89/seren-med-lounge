import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CircleNotch } from '@phosphor-icons/react/dist/ssr';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** An icon shown before the label (20px, decorative). */
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-control bg-surface text-fg hover:bg-surface-muted',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'bg-danger text-on-primary hover:bg-danger-fg',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-5 text-sm',
};

/**
 * Design system button (docs/design/DESIGN_SYSTEM.md section 7): 2px
 * radius, one primary per view, loading state keeps the label so the
 * width doesn't jump and double submits are blocked.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control font-medium',
        'transition-[background-color,transform] duration-150 active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading ? <CircleNotch size={16} className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
