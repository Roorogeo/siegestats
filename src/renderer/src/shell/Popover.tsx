import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Spread onto the trigger button. The id is how the popover finds it again to return focus. */
export interface PopoverTriggerProps {
  id: string;
  onClick(): void;
  'aria-expanded': boolean;
  'aria-haspopup': 'dialog';
  'aria-controls': string | undefined;
}

interface PopoverProps {
  /** Accessible name of the panel. */
  label: string;
  trigger(props: PopoverTriggerProps, open: boolean): ReactNode;
  /** The panel content; the function form gets `close`, which also returns focus to the trigger. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Which edge of the trigger the panel lines up with. */
  align?: 'start' | 'end';
  /** Panel width and anything else for the panel box. */
  className?: string;
  onOpenChange?(open: boolean): void;
}

const FOCUSABLE = ['a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])', '[tabindex]']
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(', ');

/** Floating panels only: a soft shadow built from the theme's own colours. */
export const FLOATING_SHADOW =
  'shadow-[0_8px_24px_color-mix(in_oklab,var(--bg)_70%,transparent)] light-theme:shadow-[0_8px_24px_color-mix(in_oklab,var(--text)_14%,transparent)]';

/**
 * A non-modal panel anchored under its trigger (no portal: it is absolutely positioned in the trigger's
 * wrapper, so it moves with it). Opening moves focus into the panel; Escape closes it and returns focus to
 * the trigger; a click outside or tabbing away closes it and leaves focus where the user put it.
 */
export function Popover({ label, trigger, children, align = 'end', className, onOpenChange }: PopoverProps) {
  const [open, setOpenState] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const triggerId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false);
      if (refocus) document.getElementById(triggerId)?.focus();
    },
    [setOpen, triggerId],
  );

  /** For the panel's own actions (picking an item): close and put focus back on the trigger. */
  const dismiss = useCallback(() => close(true), [close]);

  // Focus the first control in the panel, or the panel itself when it holds only text.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const triggerProps: PopoverTriggerProps = {
    id: triggerId,
    onClick: () => setOpen(!open),
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open ? panelId : undefined,
  };

  return (
    <div
      ref={wrapperRef}
      className="relative flex items-center"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
      onBlur={(event) => {
        // Tabbing out closes it. A null relatedTarget (window lost focus, click on nothing) is left to the pointer handler.
        const next = event.relatedTarget;
        if (open && next instanceof Node && !event.currentTarget.contains(next)) close(false);
      }}
    >
      {trigger(triggerProps, open)}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={cn(
            'absolute top-full z-50 mt-1.5 rounded-card border border-border bg-surface text-text outline-none',
            FLOATING_SHADOW,
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {typeof children === 'function' ? children(dismiss) : children}
        </div>
      )}
    </div>
  );
}
