import { useRef } from 'react';
import { cn } from '../lib/cn';
import { rovingTarget } from './roving';

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  /** T is taken from `value`, so option ids written as literals are checked against it. */
  options: readonly SegmentOption<NoInfer<T>>[];
  value: T;
  onChange(id: NoInfer<T>): void;
  /** Accessible name: "Period". */
  label: string;
  /** sm = 28 px, md = 32 px tall. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * One choice out of a few, side by side (7 / 30 / 90 days / Season; Global / PC / Console). A radio group: arrow
 * keys move the choice and the focus, Home and End jump to the ends.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, size = 'md', className }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const current = options.findIndex((o) => o.id === value);
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-stretch gap-0.5 rounded-control border border-control-border bg-surface-2 p-0.5',
        size === 'sm' ? 'h-7' : 'h-8',
        className,
      )}
      onKeyDown={(event) => {
        const target = rovingTarget(event, Math.max(0, current), options.length, (i) => options[i]?.disabled === true);
        const next = target === null ? undefined : options[target];
        if (!next) return;
        event.preventDefault();
        onChange(next.id);
        ref.current?.querySelector<HTMLElement>(`[data-segment="${CSS.escape(next.id)}"]`)?.focus();
      }}
    >
      {options.map((option, index) => {
        const checked = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            data-segment={option.id}
            disabled={option.disabled}
            tabIndex={checked || (current < 0 && index === 0) ? 0 : -1}
            onClick={() => onChange(option.id)}
            className={cn(
              'inline-flex items-center justify-center rounded-[4px] font-medium whitespace-nowrap transition-colors',
              'disabled:pointer-events-none disabled:opacity-50',
              size === 'sm' ? 'px-2.5 text-xs' : 'px-3 text-[13px]',
              checked ? 'bg-accent text-on-accent' : 'text-text-muted hover:bg-surface hover:text-text',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
