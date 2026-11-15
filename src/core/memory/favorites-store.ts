import type { Bridge } from '@shared/types/bridge';
import type { Platform, PlayerId, Unsubscribe } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { Favorite, RecentSearch } from '@shared/types/storage';
import { appError } from '@shared/util/errors';
import { jsonCopy } from '@shared/util/json';
import type { Clock } from '../ports';
import { sanitizePlayerRef } from '../settings/defaults';
import { playerKeyString } from './snapshot-store';

export type FavoritesStore = Bridge['favorites'];
export type SearchHistoryStore = Bridge['searches'];

/** Most favourites one person plausibly keeps; adding beyond this is refused rather than silently dropping one. */
export const MAX_FAVORITES = 200;
export const MAX_RECENT_SEARCHES = 10;

const PLATFORMS: readonly Platform[] = ['pc', 'psn', 'xbl'];

function playerKey(v: unknown): PlayerKey | null {
  if (typeof v !== 'object' || v === null) return null;
  const { platform, id } = v as Record<string, unknown>;
  if (!PLATFORMS.includes(platform as Platform) || typeof id !== 'string' || id.length === 0 || id.length > 128) return null;
  return { platform: platform as Platform, id: id as PlayerId };
}

/**
 * Favourites in memory (design question 10: SQLite takes over in phase 6, behind this same shape). Newest first.
 * lastKnownRank stays null until the rank-change check arrives in phase 6.
 */
export function createMemoryFavoritesStore(clock: Clock): FavoritesStore {
  let favorites: Favorite[] = [];
  const listeners = new Set<(all: Favorite[]) => void>();
  const emit = (): void => {
    for (const listener of listeners) listener(jsonCopy(favorites));
  };
  return {
    list: async () => jsonCopy(favorites),
    async add(input) {
      const player = sanitizePlayerRef(input);
      if (!player) throw appError('unknown', 'Not a player.');
      const key = playerKeyString(player);
      const existing = favorites.find((f) => playerKeyString(f.player) === key);
      if (existing) {
        // Already a favourite: keep its place and date, refresh the name it is shown under.
        if (existing.player.name === player.name && existing.player.avatarUrl === player.avatarUrl) return;
        existing.player = player;
      } else {
        if (favorites.length >= MAX_FAVORITES) throw appError('unknown', `At most ${MAX_FAVORITES} favourites.`);
        favorites = [{ player, addedAt: clock.now(), lastKnownRank: null }, ...favorites];
      }
      emit();
    },
    async remove(input) {
      const target = playerKey(input);
      if (!target) throw appError('unknown', 'Not a player.');
      const key = playerKeyString(target);
      const next = favorites.filter((f) => playerKeyString(f.player) !== key);
      if (next.length === favorites.length) return;
      favorites = next;
      emit();
    },
    onChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

/** The last searches the user opened a result of: newest first, one per player, at most 10 (design question 19). */
export function createMemorySearchHistoryStore(clock: Clock): SearchHistoryStore {
  let recent: RecentSearch[] = [];
  return {
    recent: async () => jsonCopy(recent),
    async remember(input) {
      const player = sanitizePlayerRef(input);
      if (!player) throw appError('unknown', 'Not a player.');
      const key = playerKeyString(player);
      recent = [{ player, searchedAt: clock.now() }, ...recent.filter((r) => playerKeyString(r.player) !== key)].slice(
        0,
        MAX_RECENT_SEARCHES,
      );
    },
  };
}
