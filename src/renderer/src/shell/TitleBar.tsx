import type { RefObject } from 'react';
import { useAppInfo } from '../app/AppInfoProvider';
import { cn } from '../lib/cn';
import { Logo } from '../ui';
import { ExternalLinks } from './ExternalLinks';
import { GlobalSearch } from './GlobalSearch';
import { NavButtons } from './NavButtons';
import { WindowControls } from './WindowControls';

/**
 * The frameless window's title bar, and its drag handle: everything that is not a control drags the
 * window (`app-drag`); every control opts out (`app-no-drag`), or Electron swallows its clicks.
 * Three columns keep the search centred on the window while both sides keep their natural width.
 */
export function TitleBar({ searchRef }: { searchRef: RefObject<HTMLInputElement | null> }) {
  const info = useAppInfo();
  return (
    <header className="app-drag grid h-10 shrink-0 grid-cols-[minmax(max-content,1fr)_minmax(0,520px)_minmax(max-content,1fr)] items-center gap-3 bg-surface">
      <div className="flex min-w-0 items-center gap-3 pl-3">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-[13px] font-semibold tracking-tight">{info.name}</span>
          <span className="tabular text-xs text-text-muted">v{info.version}</span>
        </div>
        <NavButtons />
      </div>
      <GlobalSearch inputRef={searchRef} />
      {/* With window controls the bar ends flush in the corner; without them (browser) it keeps a margin. */}
      <div className={cn('flex h-full items-center justify-end gap-2', info.runtime === 'browser' && 'pr-2')}>
        <ExternalLinks />
        <WindowControls />
      </div>
    </header>
  );
}
