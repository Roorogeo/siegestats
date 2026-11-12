import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Small count after the label. */
  count?: number;
  icon?: ReactNode;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange(id: T): void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
}

/** Underlined sub-tabs (Overview / Matches / ...). Arrow keys move between tabs. */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  const move = (delta: number): void => {
    const index = items.findIndex((item) => item.id === value);
    const next = items[(index + delta + items.length) % items.length];
    if (next) onChange(next.id);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex items-center gap-1 border-b border-border', className)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') move(1);
        if (event.key === 'ArrowLeft') move(-1);
      }}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors',
              selected ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && <span className="tabular text-xs text-text-muted">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
