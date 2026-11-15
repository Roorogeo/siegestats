import { useCallback } from 'react';
import type { PlayerKey, PlayerRef } from '@shared/types/player';
import type { IsoDateTime } from '@shared/types/primitives';
import type { AccountSettings } from '@shared/types/settings';
import { toIso } from '@shared/util/time';
import { useAppInfo } from '../../app/AppInfoProvider';
import { useSettings } from '../../app/SettingsProvider';
import { samePlayer } from '../../queries';

/** Only the fields a PlayerRef has, so nothing else a provider answer carries is saved into settings. */
const refOf = (player: PlayerRef): PlayerRef => ({
  platform: player.platform,
  id: player.id,
  name: player.name,
  avatarUrl: player.avatarUrl,
});

/**
 * "Pin as mine": the account is added at the end of the pinned list (once). It becomes the active account (the one
 * Home and My Profile show) when `makeActive` is set, or when no account was active yet.
 */
export function withPinned(accounts: AccountSettings, player: PlayerRef, at: IsoDateTime, makeActive = false): AccountSettings {
  const already = accounts.pinned.some((p) => samePlayer(p.player, player));
  const pinned = already ? accounts.pinned : [...accounts.pinned, { player: refOf(player), pinnedAt: at }];
  const key: PlayerKey = { platform: player.platform, id: player.id };
  return { pinned, active: makeActive || accounts.active === null ? key : accounts.active };
}

/** "Unpin": the account leaves the list; if it was the active one, the first remaining account takes over. */
export function withoutPinned(accounts: AccountSettings, player: PlayerKey): AccountSettings {
  const pinned = accounts.pinned.filter((p) => !samePlayer(p.player, player));
  const activeGone = accounts.active !== null && samePlayer(accounts.active, player);
  const first = pinned[0]?.player;
  const active = activeGone ? (first ? { platform: first.platform, id: first.id } : null) : accounts.active;
  return { pinned, active };
}

export interface PinnedAccounts {
  /** The running data source's accounts (settings.accounts[config.provider]). */
  accounts: AccountSettings;
  isPinned(player: PlayerKey): boolean;
  pin(player: PlayerRef, options?: { makeActive?: boolean }): void;
  unpin(player: PlayerKey): void;
}

/** The accounts pinned as "mine" for the running data source, with pin and unpin saved through settings. */
export function usePinnedAccounts(): PinnedAccounts {
  const { settings, update } = useSettings();
  const { provider } = useAppInfo().config;
  const accounts = settings.accounts[provider];

  const save = useCallback((next: AccountSettings) => update({ accounts: { [provider]: next } }), [provider, update]);
  const isPinned = useCallback((player: PlayerKey) => accounts.pinned.some((p) => samePlayer(p.player, player)), [accounts]);
  const pin = useCallback(
    (player: PlayerRef, options: { makeActive?: boolean } = {}) =>
      save(withPinned(accounts, player, toIso(Date.now()), options.makeActive ?? false)),
    [accounts, save],
  );
  const unpin = useCallback((player: PlayerKey) => save(withoutPinned(accounts, player)), [accounts, save]);
  return { accounts, isPinned, pin, unpin };
}
