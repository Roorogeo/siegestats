import type { GameIndex } from '@shared/game-config';
import type { PlaylistDef } from '@shared/types/game-config';
import type { PlaylistId } from '@shared/types/primitives';
import type { PlaylistStats, SeasonRecord } from '@shared/types/stats';

/** The Ranked playlist: the one whose points sit on the season's rank ladder (from the config, never by id). */
export const ladderPlaylist = (game: GameIndex): PlaylistDef | null =>
  game.playlistsWithPoints().find((playlist) => playlist.points === 'ladder') ?? null;

/** What points are called: RP on the Ranked ladder, plain points on a plain-points playlist (Legend Division). */
export type PointsUnit = 'RP' | 'points';

/**
 * The unit of a playlist's points, from the config: 'points' for a plain-points playlist, otherwise 'RP' (the
 * ladder, and the default for a playlist without points or one the config does not know).
 */
export const pointsUnit = (game: GameIndex, playlistId: PlaylistId | null): PointsUnit =>
  playlistId !== null && game.playlist(playlistId)?.points === 'plain' ? 'points' : 'RP';

/** A season's line for the Ranked playlist, or null when the player did not play it (or the config has no ladder). */
export const ladderStats = (record: SeasonRecord, ladder: PlaylistDef | null): PlaylistStats | null =>
  ladder ? (record.byPlaylist.find((p) => p.playlistId === ladder.id) ?? null) : null;

/** "PC" / "Console": the rank and matchmaking pool a season record belongs to. */
export const POOL_LABEL: Readonly<Record<SeasonRecord['platformFamily'], string>> = { pc: 'PC', console: 'Console' };

/** What a Ranked season with matches but no rank is called: placements still running, or never finished. */
export type PlacementsText = 'In placements' | 'Placements unfinished';

/**
 * The one rule for a Ranked line with no division: ranked matches played but no rank yet means placements, still
 * running in the season in force (isCurrent, from useCurrentSeason()) and unfinished in a past one. null = the
 * line has a rank, or no ranked matches (plain "Unranked").
 */
export function ladderRankText(stats: PlaylistStats | null, isCurrent: boolean): PlacementsText | null {
  if (!stats || stats.matches <= 0 || (stats.standing?.rank ?? null) !== null) return null;
  return isCurrent ? 'In placements' : 'Placements unfinished';
}
