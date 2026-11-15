import { X } from 'lucide-react';
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../lib/cn';
import { FLOATING_SHADOW, IconButton } from '../../../ui';

const subscribeResize = (onChange: () => void): (() => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

/** The window's inner height, kept current: a chart's height is a number of pixels, not a CSS length. */
const useViewportHeight = (): number => useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 800);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Space the dialog's frame takes around the plot: outer margin, title row, padding and the chart's table toggle. */
const CHROME_PX = 176;

interface ChartDialogProps {
  title: string;
  subtitle?: ReactNode;
  /** The element focus goes back to on close (the Expand button). */
  returnFocus: RefObject<HTMLElement | null>;
  onClose(): void;
  /** The chart, given the height it may take. */
  children(height: number): ReactNode;
}

/**
 * A chart at full size, as a modal dialog: the native <dialog> shown with showModal(), so the page behind is inert.
 * Focus starts on Close and wraps around inside, Escape or a click on the backdrop closes it, and focus returns to
 * the button that opened it. Mount it to open it; it calls onClose once closed.
 */
export function ChartDialog({ title, subtitle, returnFocus, onClose, children }: ChartDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const viewport = useViewportHeight();
  const height = Math.max(240, viewport - CHROME_PX);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = (): void => ref.current?.close();

  return createPortal(
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={() => {
        returnFocus.current?.focus();
        onClose();
      }}
      onClick={(event) => {
        // The dialog box itself is only reachable on its backdrop: the content fills it.
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className={cn(
        'm-auto h-[calc(100vh-48px)] max-h-none w-[calc(100vw-48px)] max-w-[1600px] rounded-card border border-border bg-surface p-0 text-text',
        'backdrop:bg-bg/80',
        FLOATING_SHADOW,
      )}
    >
      <div className="flex h-full flex-col">
        <header className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-[15px] font-semibold">
              {title}
            </h2>
            {subtitle !== undefined && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Close" className="ml-auto" onClick={close}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children(height)}</div>
      </div>
    </dialog>,
    document.body,
  );
}

