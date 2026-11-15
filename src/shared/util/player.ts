import type { PlayerKey, PlayerRef } from '../types/player';

/** "platform:id": the one string form of a player key (maps, sets, React keys, SQLite rows). */
export const playerKeyString = (player: PlayerKey): string => `${player.platform}:${player.id}`;

export const samePlayer = (a: PlayerKey, b: PlayerKey): boolean => a.platform === b.platform && a.id === b.id;

/** Just the PlayerRef fields of a richer object (a search result, a profile's player), for storing. */
export const toPlayerRef = (player: PlayerRef): PlayerRef => ({
  platform: player.platform,
  id: player.id,
  name: player.name,
  avatarUrl: player.avatarUrl,
});
