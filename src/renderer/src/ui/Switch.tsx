import { cn } from '../lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  /** Accessible name. Pair it with a visible label next to the switch. */
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
        checked ? 'border-accent bg-accent' : 'border-control-border bg-surface-2',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute size-3.5 rounded-full transition-transform',
          checked ? 'translate-x-[18px] bg-on-accent' : 'translate-x-[3px] bg-text-muted',
        )}
      />
    </button>
  );
}
