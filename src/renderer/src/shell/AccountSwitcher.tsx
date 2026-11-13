import { Check, ChevronDown, Settings2, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import type { PlayerKey, PlayerRef } from '@shared/types/player';
import type { AccountSettings } from '@shared/types/settings';
import { useAppInfo } from '../app/AppInfoProvider';
import { settingsPath } from '../app/routes';
import { useSettings } from '../app/SettingsProvider';
import { cn } from '../lib/cn';
import { EmptyState } from '../ui';
import { PLATFORM_LABEL } from './platforms';
import { Popover } from './Popover';

const sameKey = (a: PlayerKey, b: PlayerKey | null): boolean => b !== null && a.platform === b.platform && a.id === b.id;

/** Original initials badge; no remote avatars in the shell. */
function Initials({ player, className }: { player: PlayerRef; className?: string }) {
  const initials = player.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold text-text-muted', className)}
    >
      {initials}
    </span>
  );
}

/**
 * The accounts pinned as "mine" for the running data source, and which one Home and My Profile show.
 * Pinning itself arrives with profiles in phase 2; until then the list is empty.
 */
export function AccountSwitcher() {
  const { settings, update } = useSettings();
  const { provider } = useAppInfo().config;
  const accounts = settings.accounts[provider];
  const active = accounts.pinned.find(({ player }) => sameKey(player, accounts.active))?.player ?? null;

  const choose = (player: PlayerRef): void => {
    const next: AccountSettings = { pinned: accounts.pinned, active: { platform: player.platform, id: player.id } };
    update({ accounts: { [provider]: next } });
  };

  return (
    <Popover
      label="My accounts"
      className="w-72"
      trigger={(props, open) => (
        <button
          type="button"
          {...props}
          aria-label={`My accounts: ${active ? active.name : 'No account'}`}
          title="My accounts"
          className={cn(
            'inline-flex h-8 max-w-48 items-center gap-2 rounded-control px-2 text-[13px] font-medium transition-colors hover:bg-surface-2 hover:text-text',
            open ? 'bg-surface-2 text-text' : 'text-text-muted',
          )}
        >
          {active ? <Initials player={active} className="size-5 text-[9px]" /> : <UserRound className="size-4 shrink-0" aria-hidden />}
          <span className="truncate">{active ? active.name : 'No account'}</span>
          <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <h2 className="text-[13px] font-semibold">My accounts</h2>
            {accounts.pinned.length > 0 && <span className="tabular text-xs text-text-muted">{accounts.pinned.length} pinned</span>}
          </div>
          {accounts.pinned.length === 0 ? (
            <EmptyState
              className="px-4 py-6"
              icon={<UserRound className="size-5" aria-hidden />}
              title="No accounts yet"
              description="Pin an account as yours from its profile. Pinning arrives in phase 2."
            />
          ) : (
            <ul className="flex flex-col gap-0.5 p-1.5" aria-label="Pinned accounts">
              {accounts.pinned.map(({ player }) => {
                const isActive = sameKey(player, accounts.active);
                return (
                  <li key={`${player.platform}:${player.id}`}>
                    <button
                      type="button"
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => {
                        choose(player);
                        close();
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface-2',
                        isActive && 'bg-surface-2',
                      )}
                    >
                      <Initials player={player} className="size-7 text-[11px]" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] text-text">{player.name}</span>
                        <span className="text-xs text-text-muted">{PLATFORM_LABEL[player.platform]}</span>
                      </span>
                      {isActive && <Check className="size-4 shrink-0 text-accent-text" aria-label="Active" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-border p-1.5">
            <Link
              to={settingsPath('accounts')}
              onClick={close}
              className="flex h-7 items-center gap-2 rounded-control px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Settings2 className="size-4" aria-hidden />
              Account settings
            </Link>
          </div>
        </div>
      )}
    </Popover>
  );
}
