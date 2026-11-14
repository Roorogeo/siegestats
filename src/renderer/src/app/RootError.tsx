import { useRouteError } from 'react-router';
import { bridge } from '../bridge';
import { WindowControls } from '../shell/WindowControls';
import { ErrorState, Logo } from '../ui';
import { useAppInfo } from './AppInfoProvider';

/**
 * Shown instead of the whole app when a screen fails to render. The window is frameless, so this keeps a drag bar
 * and the window controls: the user can always move, minimise or close it. Deliberately not the full title bar,
 * which may be the part that failed.
 */
export function RootError() {
  const error = useRouteError();
  const info = useAppInfo();
  const message = error instanceof Error ? error.message : 'An unexpected error stopped this screen from loading.';
  const canReport = info.config.links.bug_report !== null;
  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <header className="app-drag flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface pl-3">
        <Logo title="" />
        <span className="text-[13px] font-semibold">{info.name}</span>
        <span className="ml-auto flex h-full items-stretch app-no-drag">
          <WindowControls />
        </span>
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        <ErrorState
          title="Something went wrong"
          description={<span className="selectable">{message}</span>}
          onRetry={() => window.location.reload()}
          {...(canReport ? { onReportBug: () => void bridge.app.openLink('bug_report').catch(() => undefined) } : {})}
        />
      </main>
    </div>
  );
}
