import type { PlayerKey, PlayerRef } from '@shared/types/player';
import type { IsoDateTime } from '@shared/types/primitives';
import type { AccountSettings } from '@shared/types/settings';
import { samePlayer, toPlayerRef } from '@shared/util/player';

/** The rules of pinning accounts as "mine", as plain data; usePinnedAccounts saves their result through settings. */

/**
 * "Pin as mine": the account is added at the end of the pinned list (once). It becomes the active account (the one
 * Home and My Profile show) when `makeActive` is set, or when no account was active yet.
 */
export function withPinned(accounts: AccountSettings, player: PlayerRef, at: IsoDateTime, makeActive = false): AccountSettings {
  const already = accounts.pinned.some((p) => samePlayer(p.player, player));
  const pinned = already ? accounts.pinned : [...accounts.pinned, { player: toPlayerRef(player), pinnedAt: at }];
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
