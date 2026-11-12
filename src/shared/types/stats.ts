import type { MapId, OperatorId, PlatformFamily, PlaylistId, RankId, Ratio, SeasonId } from './primitives';

export interface CombatStats {
  kills: number;
  deaths: number;
  assists: number | null;
  headshotPct: Ratio | null;
}

/** Aggregated over matches: profile, season, playlist, map. */
export interface MatchStats extends CombatStats {
  matches: number;
  wins: number;
  losses: number;
  rounds: number | null;
  damagePerRound: number | null;
}

/** Aggregated over rounds: operators are picked per round. */
export interface RoundStats extends CombatStats {
  rounds: number;
  roundsWon: number;
}

export interface OperatorStats extends RoundStats {
  operatorId: OperatorId;
}

export interface MapStats extends MatchStats {
  mapId: MapId;
}

export interface RankPoint {
  points: number;
  rankId: RankId | null; // null = these points have no division (a 'plain' playlist), or the ladder is not in the config
}

/** A player's standing in one points playlist for one season. */
export interface RankedStanding {
  rank: RankPoint | null; // current standing, or where the season ended. null = unranked / in placements
  peak: RankPoint | null; // highest standing reached that season
  topPosition: number | null; // numbered place at the very top, when the source exposes one
}

export interface PlaylistStats extends MatchStats {
  playlistId: PlaylistId;
  standing: RankedStanding | null; // only for playlists with points
}

/** One season of one player. getSeasons() returns one per season played, newest first. */
export interface SeasonRecord {
  seasonId: SeasonId;
  platformFamily: PlatformFamily; // rank belongs to the pool, not the account
  overall: MatchStats;
  byPlaylist: PlaylistStats[];
  bestAttacker: OperatorStats | null;
  bestDefender: OperatorStats | null;
}
