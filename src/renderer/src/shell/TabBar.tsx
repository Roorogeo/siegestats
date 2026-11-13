import { Settings } from 'lucide-react';
import { Link, NavLink, useMatch } from 'react-router';
import { ROUTES, settingsPath, TABS } from '../app/routes';
import { useTabDots } from '../app/tab-dots';
import { cn } from '../lib/cn';
import { AccountSwitcher } from './AccountSwitcher';
import { NotificationBell } from './NotificationBell';

/** Same look as IconButton, for the one icon-only control that is a link. */
function SettingsLink() {
  const active = useMatch(`${ROUTES.settings}/*`) !== null;
  return (
    <Link
      to={settingsPath()}
      aria-label="Settings"
      title="Settings"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-surface-2 hover:text-text',
        active ? 'bg-surface-2 text-accent-text' : 'text-text-muted',
      )}
    >
      <Settings className="size-4" aria-hidden />
    </Link>
  );
}

/** The five tabs of the brief, and on the right the account switcher, settings and the bell. */
export function TabBar() {
  const dots = useTabDots();
  return (
    <div className="flex h-11 shrink-0 items-stretch gap-4 border-b border-border bg-surface px-3">
      <nav aria-label="Main" className="flex min-w-0 items-stretch">
        <ul className="flex min-w-0 items-stretch gap-0.5">
          {TABS.map((tab) => (
            <li key={tab.id} className="relative flex items-center">
              <NavLink
                to={tab.path}
                end={tab.path === ROUTES.home}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium whitespace-nowrap transition-colors hover:bg-surface-2 hover:text-text',
                    isActive ? 'text-text' : 'text-text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {tab.label}
                    {dots[tab.id] && (
                      <>
                        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                        <span className="sr-only">, new activity</span>
                      </>
                    )}
                    {/* Positioned against the <li>, so it sits on the row's bottom border. */}
                    <span
                      aria-hidden
                      className={cn('absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent transition-opacity', isActive ? 'opacity-100' : 'opacity-0')}
                    />
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <AccountSwitcher />
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <SettingsLink />
        <NotificationBell />
      </div>
    </div>
  );
}
