import { Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { rovingTarget } from './roving';

export interface ChipOption<T extends string> {
  id: T;
  label: string;
  /** Small number after the label (matches in that playlist). */
  count?: number;
  disabled?: boolean;
}

interface ChipGroupProps<T extends string> {
  options: readonly ChipOption<NoInfer<T>>[];
  /** 'all' = no filter (the All chip is on). Matches the shape of the query filters, e.g. MatchHistoryQuery.playlistIds. */
  value: readonly T[] | 'all';
  onChange(value: NoInfer<T>[] | 'all'): void;
  /** Accessible name of the group: "Playlists". */
  label: string;
  /** Label of the chip that clears the filter; null = no such chip (an empty selection is then allowed). */
  allLabel?: string | null;
  className?: string;
}

/**
 * Multi-select filter chips (toggle buttons). Picking a chip while All is on selects only that chip; turning the last
 * chip off, or turning every chip on, goes back to All. Arrow keys, Home and End move between chips; Space or Enter
 * toggles. Selection shows as a check mark as well as colour.
 */
export function ChipGroup<T extends string>({ options, value, onChange, label, allLabel = 'All', className }: ChipGroupProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  /** The chip that Tab lands on (roving tabindex): the last one focused, else the first selected one. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const hasAll = allLabel !== null;
  const allOn = value === 'all';
  const selected = new Set<string>(allOn ? [] : value);

  const toggle = (id: T): void => {
    const next = allOn ? [id] : selected.has(id) ? value.filter((v) => v !== id) : [...value, id];
    const enabled = options.filter((o) => !o.disabled);
    if (hasAll && (next.length === 0 || (enabled.length > 1 && enabled.every((o) => next.includes(o.id))))) onChange('all');
    else onChange(next);
  };

  const items: { key: string; label: string; count?: number; pressed: boolean; disabled: boolean; onClick(): void }[] = [
    ...(hasAll ? [{ key: '__all', label: allLabel, pressed: allOn, disabled: false, onClick: () => onChange('all') }] : []),
    ...options.map((o) => ({
      key: o.id,
      label: o.label,
      ...(o.count === undefined ? {} : { count: o.count }),
      pressed: selected.has(o.id),
      disabled: o.disabled ?? false,
      onClick: () => toggle(o.id),
    })),
  ];
  const firstPressed = Math.max(0, items.findIndex((item) => item.pressed && !item.disabled));
  const tabStop = focusIndex !== null && focusIndex < items.length && !items[focusIndex]?.disabled ? focusIndex : firstPressed;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      onKeyDown={(event) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const current = buttons.findIndex((b) => b === document.activeElement);
        if (current < 0) return;
        const target = rovingTarget(event, current, buttons.length, (i) => buttons[i]?.disabled ?? true);
        if (target === null) return;
        event.preventDefault();
        setFocusIndex(target);
        buttons[target]?.focus();
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.pressed}
          disabled={item.disabled}
          tabIndex={index === tabStop ? 0 : -1}
          onFocus={() => setFocusIndex(index)}
          onClick={item.onClick}
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
            item.pressed
              ? 'border-accent-text bg-[color-mix(in_oklab,var(--accent)_16%,var(--surface-2))] text-text'
              : 'border-control-border bg-transparent text-text-muted hover:bg-surface-2 hover:text-text',
          )}
        >
          {item.pressed && <Check className="-ml-1 size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
          {item.label}
          {item.count !== undefined && <span className="tabular text-text-muted">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
