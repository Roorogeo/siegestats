import type { GameIndex } from '@shared/game-config';
import type { PlaylistDef } from '@shared/types/game-config';
import type { PlaylistStats, SeasonRecord } from '@shared/types/stats';

/** The Ranked playlist: the one whose points sit on the season's rank ladder (from the config, never by id). */
export const ladderPlaylist = (game: GameIndex): PlaylistDef | null =>
  game.playlistsWithPoints().find((playlist) => playlist.points === 'ladder') ?? null;

/** A season's line for the Ranked playlist, or null when the player did not play it (or the config has no ladder). */
export const ladderStats = (record: SeasonRecord, ladder: PlaylistDef | null): PlaylistStats | null =>
  ladder ? (record.byPlaylist.find((p) => p.playlistId === ladder.id) ?? null) : null;

/** "PC" / "Console": the rank and matchmaking pool a season record belongs to. */
export const POOL_LABEL: Readonly<Record<SeasonRecord['platformFamily'], string>> = { pc: 'PC', console: 'Console' };
