import { Outlet } from 'react-router';
import { useAppInfo } from '../app/AppInfoProvider';
import { Logo } from '../ui';

/** Placeholder shell: just enough chrome to host a page. The real title bar and tab bar replace this file. */
export function AppShell() {
  const info = useAppInfo();
  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <header className="app-drag flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <Logo />
        <span className="text-[13px] font-semibold">{info.name}</span>
        <span className="text-xs text-text-muted">v{info.version}</span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
