import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shown before the label. */
  icon?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:opacity-90 border-transparent',
  secondary: 'bg-surface-2 text-text border-border hover:border-text-muted',
  ghost: 'bg-transparent text-text-muted border-transparent hover:bg-surface-2 hover:text-text',
};
const SIZE: Record<Size, string> = { sm: 'h-7 px-2.5 text-xs gap-1.5', md: 'h-8 px-3 text-[13px] gap-2' };

export function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control border font-medium whitespace-nowrap transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
