import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { GameIndex } from '@shared/game-config';
import type { PlaylistId, SeasonId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { PlayerStatsQuery } from '@shared/types/provider';
import type { SeasonRecord } from '@shared/types/stats';
import { useGame } from '../../../app/GameConfigProvider';
import { useSeasons } from '../../../queries';
import type { SelectOption } from './FilterSelect';

/**
 * The season / playlist filters of the Operators and Maps tabs, kept in the URL so back and forward restore them.
 * Each tab has its own prefix ("o" operators, "m" maps): oseason=Y11S2&oplaylist=ranked. The season defaults to the
 * current one and the playlist to all; defaults are left out of the URL. The map filter is Home's (design
 * question 23), so these queries always ask for every map.
 */
export interface StatsFilters {
  seasonId: SeasonId | 'all';
  playlistId: PlaylistId | 'all';
}

export type FilterPrefix = 'o' | 'm';

const ALL = 'all';

function readFilters(params: URLSearchParams, prefix: FilterPrefix, game: GameIndex): StatsFilters {
  const season = params.get(`${prefix}season`);
  const playlist = params.get(`${prefix}playlist`);
  return {
    seasonId: season === ALL ? ALL : ((season === null ? null : game.season(season)?.id) ?? game.currentSeason().id),
    playlistId: (playlist === null ? null : game.playlist(playlist)?.id) ?? ALL,
  };
}

/** Reads and writes one tab's filters. Every change is a new history entry. */
export function useStatsFilters(prefix: FilterPrefix): [StatsFilters, (patch: Partial<StatsFilters>) => void] {
  const game = useGame();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params, prefix, game);
  const update = (patch: Partial<StatsFilters>): void =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (patch.seasonId !== undefined) {
          if (patch.seasonId === game.currentSeason().id) next.delete(`${prefix}season`);
          else next.set(`${prefix}season`, patch.seasonId);
        }
        if (patch.playlistId !== undefined) {
          if (patch.playlistId === ALL) next.delete(`${prefix}playlist`);
          else next.set(`${prefix}playlist`, patch.playlistId);
        }
        return next;
      },
      { preventScrollReset: true },
    );
  return [filters, update];
}

export const statsQuery = (player: PlayerKey, filters: StatsFilters): PlayerStatsQuery => ({
  player,
  seasonId: filters.seasonId,
  playlistId: filters.playlistId,
  mapId: ALL,
});

const seasonNumber = (game: GameIndex, id: string): number => game.season(id)?.number ?? -1;

/** "Operation Silent Hunt (Y11S1)"; an id the config does not know shows as itself. */
export const seasonLabel = (game: GameIndex, id: SeasonId): string => {
  const season = game.season(id);
  return season ? `${season.name} (${season.id})` : id;
};

export interface FilterOptions {
  seasons: SelectOption<SeasonId | 'all'>[];
  playlists: SelectOption<PlaylistId | 'all'>[];
  /** The player's record of the selected season, when it is loaded (null for "All seasons"). */
  record: SeasonRecord | null;
  /** The player's seasons, once loaded. */
  records: readonly SeasonRecord[] | undefined;
}

/**
 * The choices of the two selects. Seasons: the ones the player played (from getSeasons), newest first, plus the
 * current season and the selected one. Playlists: the ones the player played in the selected season (or in any
 * season), falling back to the config's playlists of that season until the seasons load, plus the selected one.
 */
export function useFilterOptions(player: PlayerKey, filters: StatsFilters): FilterOptions {
  const game = useGame();
  const seasons = useSeasons(player);
  const records = seasons.data?.data;
  return useMemo(() => {
    const current = game.currentSeason().id;
    const seasonIds = new Set<SeasonId>([current, ...(records ?? []).map((r) => r.seasonId)]);
    if (filters.seasonId !== ALL) seasonIds.add(filters.seasonId);
    const seasonOptions: SelectOption<SeasonId | 'all'>[] = [
      ...[...seasonIds].sort((a, b) => seasonNumber(game, b) - seasonNumber(game, a)).map((id) => ({ id, label: seasonLabel(game, id) })),
      { id: ALL, label: 'All seasons' },
    ];

    const record = filters.seasonId === ALL ? null : (records?.find((r) => r.seasonId === filters.seasonId) ?? null);
    const inScope = filters.seasonId === ALL ? (records ?? []) : record ? [record] : [];
    const played = new Set<string>(inScope.flatMap((r) => r.byPlaylist.filter((p) => p.matches > 0).map((p) => p.playlistId)));
    const fallback = (id: PlaylistId): boolean => filters.seasonId === ALL || game.playlistActiveIn(id, filters.seasonId);
    const playlistOptions: SelectOption<PlaylistId | 'all'>[] = [
      { id: ALL, label: 'All playlists' },
      ...game.config.playlists
        .filter((p) => p.id === filters.playlistId || (records ? played.has(p.id) : fallback(p.id)))
        .map((p) => ({ id: p.id, label: p.name })),
    ];
    return { seasons: seasonOptions, playlists: playlistOptions, record, records };
  }, [game, records, filters.seasonId, filters.playlistId]);
}
