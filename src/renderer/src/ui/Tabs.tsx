import { useRef, type ReactNode } from 'react';
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
  /**
   * Gives every tab the id `${idPrefix}-tab-${id}` and points it at `${idPrefix}-panel-${id}`, so the panel can use
   * tabPanelProps() to get role, id and aria-labelledby.
   */
  idPrefix?: string;
  className?: string;
}

/** Props for the element that shows the selected tab's content. */
export const tabPanelProps = (idPrefix: string, id: string) => ({
  role: 'tabpanel' as const,
  id: `${idPrefix}-panel-${id}`,
  'aria-labelledby': `${idPrefix}-tab-${id}`,
});

/** Underlined sub-tabs (Overview / Matches / ...). Arrow keys, Home and End move the selection and the focus. */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix, className }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const go = (index: number): void => {
    const next = items[(index + items.length) % items.length];
    if (!next) return;
    onChange(next.id);
    // The tab button already exists, so focus can move now instead of after the re-render.
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus();
  };
  const current = items.findIndex((item) => item.id === value);
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn('flex items-center gap-1 border-b border-border', className)}
      onKeyDown={(event) => {
        const target = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: items.length - 1 }[event.key];
        if (target === undefined) return;
        event.preventDefault();
        go(target);
      }}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab-id={item.id}
            {...(idPrefix ? { id: `${idPrefix}-tab-${item.id}`, 'aria-controls': `${idPrefix}-panel-${item.id}` } : {})}
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
