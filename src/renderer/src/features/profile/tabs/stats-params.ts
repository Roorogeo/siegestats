import type { GameIndex } from '@shared/game-config';
import type { PlaylistId, SeasonId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { PlayerStatsQuery } from '@shared/types/provider';
import type { SeasonRecord } from '@shared/types/stats';

/**
 * The season / playlist filters of the Operators and Maps tabs, kept in the URL so back and forward restore them.
 * Each tab has its own prefix ("o" operators, "m" maps): oseason=Y11S2&oplaylist=ranked. The season defaults to the
 * one in force (useCurrentSeason()) and the playlist to all; defaults are left out of the URL. The map filter is Home's (design
 * question 23), so these queries always ask for every map.
 */
export interface StatsFilters {
  seasonId: SeasonId | 'all';
  playlistId: PlaylistId | 'all';
}

export type FilterPrefix = 'o' | 'm';

export const ALL = 'all';

/** One tab's filters from the URL; a missing or unknown season is the season in force, passed in as currentSeasonId. */
export function readFilters(params: URLSearchParams, prefix: FilterPrefix, game: GameIndex, currentSeasonId: SeasonId): StatsFilters {
  const season = params.get(`${prefix}season`);
  const playlist = params.get(`${prefix}playlist`);
  return {
    seasonId: season === ALL ? ALL : ((season === null ? null : game.season(season)?.id) ?? currentSeasonId),
    playlistId: (playlist === null ? null : game.playlist(playlist)?.id) ?? ALL,
  };
}

export const statsQuery = (player: PlayerKey, filters: StatsFilters): PlayerStatsQuery => ({
  player,
  seasonId: filters.seasonId,
  playlistId: filters.playlistId,
  mapId: ALL,
});

/** "Operation Silent Hunt (Y11S1)"; an id the config does not know shows as itself. */
export const seasonLabel = (game: GameIndex, id: SeasonId): string => {
  const season = game.season(id);
  return season ? `${season.name} (${season.id})` : id;
};

/**
 * What the player's season records say the filters' scope holds: matches, or rounds, of the selected season (every
 * season for "All seasons") and playlist. A per-map or per-operator breakdown that adds up to less does not cover
 * the whole scope. null while the records load, or when a record does not count rounds.
 */
export function scopeTotal(records: readonly SeasonRecord[] | undefined, filters: StatsFilters, field: 'matches' | 'rounds'): number | null {
  if (!records) return null;
  let total = 0;
  for (const record of records) {
    if (filters.seasonId !== ALL && record.seasonId !== filters.seasonId) continue;
    const line = filters.playlistId === ALL ? record.overall : record.byPlaylist.find((p) => p.playlistId === filters.playlistId);
    const value = line ? line[field] : 0;
    if (value === null) return null;
    total += value;
  }
  return total;
}
