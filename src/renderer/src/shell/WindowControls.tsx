import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAppInfo } from '../app/AppInfoProvider';
import { bridge } from '../bridge';
import { cn } from '../lib/cn';

function WindowButton({ label, onClick, danger = false, children }: { label: string; onClick(): void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        // Windows conventions: 46px wide, the full height of the title bar, square corners.
        'inline-flex h-full w-[46px] items-center justify-center text-text-muted transition-colors focus-visible:outline-offset-[-2px]',
        danger ? 'hover:bg-negative hover:text-bg active:opacity-80' : 'hover:bg-surface-2 hover:text-text active:opacity-80',
      )}
    >
      {children}
    </button>
  );
}

/** Minimize / maximize-restore / close for the frameless window. Absent in a browser, where there is no window to control. */
export function WindowControls() {
  const { runtime } = useAppInfo();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (runtime === 'browser') return;
    let current = true;
    void bridge.window.isMaximized().then((value) => {
      if (current) setMaximized(value);
    });
    const unsubscribe = bridge.window.onMaximizedChange(setMaximized);
    return () => {
      current = false;
      unsubscribe();
    };
  }, [runtime]);

  if (runtime === 'browser') return null;
  return (
    <div className="app-no-drag flex h-full items-stretch self-stretch">
      <WindowButton label="Minimize" onClick={() => void bridge.window.minimize()}>
        <Minus className="size-4" strokeWidth={1.5} aria-hidden />
      </WindowButton>
      <WindowButton label={maximized ? 'Restore' : 'Maximize'} onClick={() => void bridge.window.toggleMaximize()}>
        {maximized ? (
          <Copy className="size-3.5 -scale-x-100" strokeWidth={1.5} aria-hidden />
        ) : (
          <Square className="size-3.5" strokeWidth={1.5} aria-hidden />
        )}
      </WindowButton>
      <WindowButton label="Close" danger onClick={() => void bridge.window.close()}>
        <X className="size-4" strokeWidth={1.5} aria-hidden />
      </WindowButton>
    </div>
  );
}
