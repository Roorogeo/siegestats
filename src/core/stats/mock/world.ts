import type { MapDef, PlaylistDef, SeasonDef } from '@shared/types/game-config';
import type { RankChange } from '@shared/types/match';
import type {
  IsoDateTime, MapId, MatchId, OperatorId, PlatformFamily, PlaylistId, RegionId, SeasonId, Side, TeamId,
} from '@shared/types/primitives';
import type { PlayerRef } from '@shared/types/player';
import type { RankedStanding, SeasonRecord } from '@shared/types/stats';
import type { OperatorTally, Tally } from './tally';

/** Internal model of the generated world. None of this crosses the bridge as is; the provider builds the public types from it. */

/** One person: traits shared by every account they own (level is account-wide in Siege: cross-progression). */
export interface MockPerson {
  index: number;
  /** Hidden rating, standard normal. Drives K/D, win rate and RP; never exposed. */
  skill: number;
  /** Relative share of matches played. */
  activity: number;
  headshotRate: number;
  level: number;
  /** Fraction of the generated window [0, 1] between which this person plays. */
  activeFrom: number;
  activeUntil: number;
  /** Their account goes back to this season number (summary-only seasons start here). */
  firstSeasonNumber: number;
  /** Per side: every operator of that side with its pick weight; the favourites dominate. */
  operatorWeights: Record<Side, OperatorPool>;
}

/** The operators of one side (GameIndex.operatorsBySide order) and one person's weight for each, as parallel arrays. */
export interface OperatorPool {
  ids: readonly OperatorId[];
  weights: readonly number[];
}

export interface MockAccount {
  /** Position in MockWorld.accounts. */
  index: number;
  key: string; // playerKeyString(ref): `${platform}:${id}`
  ref: PlayerRef;
  family: PlatformFamily;
  person: MockPerson;
  /** 1 for a person's main account, less for a second one. */
  activityShare: number;
  /** Plays Legend Division (a few dozen top players); null otherwise. */
  legendRegionId: RegionId | null;
  /** Accounts that queue together (a stable friend group), or null. */
  partyId: number | null;
  /** Keys of the same person's other accounts: links the source asserts, never inferred from names. */
  linked: string[];
}

/** Per side, per operator: counted over the rounds it was picked in. */
export type OperatorTallies = Record<Side, Map<OperatorId, OperatorTally>>;

/** One operator on one side in one match. */
export interface OperatorRounds extends OperatorTally {
  operatorId: OperatorId;
  side: Side;
}

/**
 * A match's rounds as typed arrays (one entry per round; picks: round * slots + slot = position in that side's
 * GameIndex.operatorsBySide list, -1 = none). expandRounds() builds the public MatchRound[] when a match is opened.
 */
export interface CompactRounds {
  count: number;
  slots: number;
  winnerOrange: Uint8Array;
  attackersOrange: Uint8Array;
  outcome: Uint8Array;
  picks: Int16Array;
}

/** One player in one match. */
export interface MatchSlot {
  account: MockAccount;
  team: TeamId; // slots 0-4 are blue, 5-9 orange
  tally: Tally; // this one match (matches = 1)
  operators: OperatorRounds[]; // first-picked order
  score: number;
  rankChange: RankChange | null;
}

/** A generated match. The public MatchDetail / MatchSummary are built from this on request. */
export interface GeneratedMatch {
  index: number;
  id: MatchId;
  gameMatchId: string;
  startMs: number;
  startedAt: IsoDateTime;
  durationSec: number;
  season: SeasonDef;
  playlist: PlaylistDef;
  map: MapDef;
  score: Record<TeamId, number>;
  winner: TeamId;
  slots: MatchSlot[];
  rounds: CompactRounds;
}

export interface Participation {
  match: GeneratedMatch;
  slot: number;
}

/** One playlist line of a summary-only season, broken down: each part sums to that line's counts. */
export interface SummaryLine {
  /** Per map: the line's matches and every other count (matches, wins, kills, rounds, ...). */
  maps: Map<MapId, Tally>;
  /** Per side and operator: the line's rounds, rounds won, kills, deaths, assists and headshots. */
  operators: OperatorTallies;
}

/** One season of one account, as counts. */
export interface SeasonAgg {
  seasonId: SeasonId;
  /** false = generated as a summary only, before the window: it has no listed matches. */
  fromMatches: boolean;
  overall: Tally;
  byPlaylist: Map<PlaylistId, { tally: Tally; standing: RankedStanding | null }>;
  /** Per side and operator, over the whole season (summary-only seasons: the sum of their lines' operators). */
  operators: OperatorTallies;
  /**
   * Summary-only seasons: the per-map and per-operator breakdown of each playlist line, which listed matches give
   * the others. Nothing per map and operator together. null for a season built from listed matches, and for a
   * summary-only season until MockWorld.seasonsOf() has filled it in.
   */
  summary: Map<PlaylistId, SummaryLine> | null;
}

export interface MockWorld {
  seed: number;
  generatedAt: IsoDateTime;
  /** The season the generator treats as current: GameIndex.currentSeasonAt(now), the app's one rule. */
  currentSeasonId: SeasonId;
  windowStart: IsoDateTime;
  accounts: MockAccount[];
  accountByKey: Map<string, MockAccount>;
  matches: GeneratedMatch[]; // oldest first
  matchById: Map<string, GeneratedMatch>;
  /** Per account, oldest first. */
  participations: Map<string, Participation[]>;
  /**
   * Per account, per season id: totals and standings. A summary-only season's breakdown (`summary`, and so its
   * `operators`) is only there once seasonsOf() has run for that account; read it through seasonsOf().
   */
  seasons: Map<string, Map<SeasonId, SeasonAgg>>;
  /** One account's seasons with every breakdown filled in (summary-only seasons: built on first use, then kept). */
  seasonsOf(accountKey: string): Map<SeasonId, SeasonAgg>;
  /** Public season records of one account, newest first (built on first use from seasonsOf, then kept). */
  seasonRecords(accountKey: string): SeasonRecord[];
}
