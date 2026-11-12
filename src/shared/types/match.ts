import type { IsoDateTime, MapId, MatchId, OperatorId, PlaylistId, Ratio, SeasonId, TeamId } from './primitives';
import type { PlayerKey, PlayerRef } from './player';
import type { RankPoint } from './stats';

export type MatchResult = 'win' | 'loss' | 'draw';
/** 'provider' = from the StatsProvider. 'live' = recorded on this PC by Live Match. */
export type MatchOrigin = 'provider' | 'live';

export interface MatchHeader {
  id: MatchId;
  origin: MatchOrigin;
  /** The game's own match id when known. The only thing used to tell that a live copy and a provider copy are the same match. */
  gameMatchId: string | null;
  playlistId: PlaylistId | null; // null = a playlist the config does not know yet
  mapId: MapId | null; // null = a map the config does not know yet
  seasonId: SeasonId;
  startedAt: IsoDateTime;
  durationSec: number | null;
}

export interface RankChange {
  after: RankPoint;
  delta: number;
}

/** One row of a player's match history, from that player's point of view. */
export interface MatchSummary extends MatchHeader {
  result: MatchResult;
  score: { own: number; opponent: number };
  rankChange: RankChange | null; // points playlists only, and only if the source tracked it
  kills: number;
  deaths: number;
  assists: number | null;
  headshotPct: Ratio | null;
  hasDetail: boolean; // false -> "View match" is disabled
}

export type MatchPeriod = { kind: 'days'; days: 7 | 30 | 90 } | { kind: 'season'; seasonId: SeasonId };

export interface MatchHistoryQuery {
  player: PlayerKey;
  playlistIds: PlaylistId[] | 'all'; // the filter chips
  mapId: MapId | 'all';
  period: MatchPeriod | 'all';
  cursor: string | null;
  limit: number;
}

/** The summary row. Covers the whole filtered period, not just the loaded page. */
export interface MatchHistorySummary {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  streak: { result: 'win' | 'loss'; length: number } | null; // the current streak
  pointsChange: number | null;
}

export interface MatchHistoryPage {
  items: MatchSummary[];
  nextCursor: string | null;
  summary: MatchHistorySummary;
}

export interface MatchDetail extends MatchHeader {
  teams: [MatchTeam, MatchTeam]; // the screen lists first the team of the player it was opened from, or the recorder's team
  /** origin 'live': the slot of the player who recorded it (always on team blue). null for provider matches. */
  recorderSlot: number | null;
  /** null = the source has no round data; the timeline shows an empty state. */
  rounds: MatchRound[] | null;
}

export interface MatchTeam {
  id: TeamId;
  score: number;
  result: MatchResult;
  players: MatchPlayer[];
}

export interface MatchPlayer {
  slot: number; // unique within the match; RoundPick refers to it
  name: string; // as shown in that match
  /** null = no identity to link to; the row is not clickable. Always null for other players in a capture whose source forbids opening profiles. */
  player: PlayerRef | null;
  kills: number;
  deaths: number;
  assists: number | null;
  headshotPct: Ratio | null;
  damage: number | null;
  score: number | null;
  operatorIds: OperatorId[]; // distinct operators played, most-played first
}

export type RoundOutcome =
  | 'team_eliminated'
  | 'bomb_detonated'
  | 'bomb_defused'
  | 'objective_secured'
  | 'objective_protected'
  | 'time_expired'
  | 'hostage_extracted'
  | 'hostage_killed';

export interface MatchRound {
  number: number; // 1-based; never assume a fixed count (overtime)
  winner: TeamId | null;
  attackers: TeamId | null;
  outcome: RoundOutcome | null;
  picks: RoundPick[];
}

export interface RoundPick {
  slot: number;
  operatorId: OperatorId | null;
}

/** Someone the profile owner has shared more than one match with. */
export interface Encounter {
  player: PlayerRef;
  matches: number; // >= 2
  asTeammate: number;
  asOpponent: number;
  wins: number; // the profile owner's wins in those matches
  lastMetAt: IsoDateTime;
  lastMatchId: MatchId | null;
}
