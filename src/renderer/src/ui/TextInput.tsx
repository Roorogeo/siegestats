import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../lib/cn';

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Icon inside the field, on the left. */
  leading?: ReactNode;
  /** Anything inside the field, on the right (a shortcut hint, a clear button). */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
  wrapperClassName?: string;
}

export function TextInput({ leading, trailing, className, wrapperClassName, ref, ...rest }: TextInputProps) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-2 rounded-control border border-border bg-surface-2 px-2.5 text-text-muted transition-colors',
        'focus-within:border-accent focus-within:text-text',
        wrapperClassName,
      )}
    >
      {leading}
      <input
        ref={ref}
        className={cn('h-full min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-muted', className)}
        {...rest}
      />
      {trailing}
    </div>
  );
}
