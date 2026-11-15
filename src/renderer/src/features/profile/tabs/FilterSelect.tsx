import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../../lib/cn';

export interface SelectOption<T extends string> {
  id: T;
  label: string;
}

interface FilterSelectProps<T extends string> {
  /** Visible label before the field ("Season"); also its accessible name. */
  label: string;
  value: T;
  options: readonly SelectOption<NoInfer<T>>[];
  onChange(id: NoInfer<T>): void;
  className?: string;
}

/**
 * A labelled native select for one filter (season, playlist): long lists stay keyboard- and screen-reader friendly
 * without a custom listbox. The open list uses the theme's surface and text colours.
 */
export function FilterSelect<T extends string>({ label, value, options, onChange, className }: FilterSelectProps<T>) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <label htmlFor={id} className="shrink-0 text-xs text-text-muted">
        {label}
      </label>
      <span className="relative inline-flex min-w-0">
        <select
          id={id}
          value={value}
          onChange={(event) => {
            const picked = options.find((option) => option.id === event.target.value);
            if (picked) onChange(picked.id);
          }}
          className="h-8 min-w-0 appearance-none truncate rounded-control border border-control-border bg-surface-2 pr-7 pl-2.5 text-[13px] text-text transition-colors hover:border-text-muted"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id} className="bg-surface text-text">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-text-muted" aria-hidden />
      </span>
    </div>
  );
}
