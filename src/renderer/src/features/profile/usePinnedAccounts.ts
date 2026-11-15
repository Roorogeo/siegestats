import { useCallback } from 'react';
import type { PlayerKey, PlayerRef } from '@shared/types/player';
import type { AccountSettings } from '@shared/types/settings';
import { samePlayer } from '@shared/util/player';
import { toIso } from '@shared/util/time';
import { useAppInfo } from '../../app/AppInfoProvider';
import { useSettings } from '../../app/SettingsProvider';
import { withoutPinned, withPinned } from './pinning';

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
