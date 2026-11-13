import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { setOpenTab, tabForPath } from '../app/tab-dots';
import { TabBar } from './TabBar';
import { TitleBar } from './TitleBar';
import { useGlobalShortcuts } from './useGlobalShortcuts';

/**
 * The window: a 40px title bar, a 44px tab row, and the routed page filling the rest. Only the page
 * scrolls; the shell itself never does.
 */
export function AppShell() {
  const searchRef = useRef<HTMLInputElement>(null);
  useGlobalShortcuts(searchRef);

  const openTab = tabForPath(useLocation().pathname);
  useEffect(() => setOpenTab(openTab), [openTab]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar searchRef={searchRef} />
      <TabBar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
