import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: the accessible name, also shown as the tooltip. */
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
  /** Shows the "something new" dot in the corner. */
  dot?: boolean;
  active?: boolean;
}

export function IconButton({ label, children, size = 'md', dot = false, active = false, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-control text-text-muted transition-colors',
        'hover:bg-surface-2 hover:text-text disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' ? 'size-7' : 'size-8',
        active && 'bg-surface-2 text-text',
        className,
      )}
      {...rest}
    >
      {children}
      {dot && <span aria-hidden className="absolute right-1 top-1 size-2 rounded-full bg-accent ring-2 ring-surface" />}
    </button>
  );
}
