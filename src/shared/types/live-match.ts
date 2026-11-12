import type {
  IsoDateTime, MapId, MatchId, OperatorId, Platform, PlayerId, PlaylistId, RankId, Ratio, Side, TeamId, Unsubscribe,
} from './primitives';
import type { PlayerKey } from './player';
import type { MatchResult, RoundOutcome } from './match';

export type LiveSourceId = 'mock' | 'overwolf';

/** The seven Live Match screens, one to one with the brief. */
export type LiveGameState =
  | 'game_not_running'
  | 'in_menus'
  | 'loading'
  | 'in_match'
  | 'match_ended'
  | 'unsupported_mode'
  | 'connection_failed';

export type LiveFailure =
  | 'runtime_not_supported' // not running on ow-electron
  | 'not_authorized' // Overwolf credentials / signature missing
  | 'package_failed' // the events package failed to load or crashed
  | 'elevation_required' // the game runs elevated and the app does not
  | 'events_down' // Overwolf reports this game's events as unavailable
  | 'unknown';

export interface LiveStatus {
  state: LiveGameState;
  failure: LiveFailure | null; // set only for 'connection_failed'
  degraded: boolean; // events partly available, or the app joined mid-match: data may be incomplete
}

/** What this source delivers right now; the table hides a column rather than showing zeros. */
export interface LiveCapabilities {
  assists: boolean;
  score: boolean;
  roundOutcomes: boolean;
  operatorPicks: boolean;
  side: boolean; // derived from my operator, never guessed
  localDamage: boolean; // my own damage per round; never available for other players
}

export interface LiveMatchInfo {
  captureId: string; // id of this capture
  gameMatchId: string | null; // the game's own match id, when the source has it
  playlistId: PlaylistId | null; // null = not in the config; rawMode is still shown
  mapId: MapId | null;
  rawMode: string | null;
  rawMap: string | null;
  startedAt: IsoDateTime;
}

/** One roster slot as it may be displayed: only what an events API legitimately exposes. */
export interface LiveRosterEntry {
  slot: number; // stable while the player is in the match
  displayName: string; // the complete name exactly as the game shows it (custom name, suffix); the UI never alters it
  team: TeamId;
  isLocal: boolean;
  connected: boolean;
  /** A source must not report an enemy's operator before the game itself reveals it. */
  operatorId: OperatorId | null;
  rawOperator: string | null;
  kills: number;
  deaths: number;
  assists: number | null;
  score: number | null;
}

/** An identity from a live roster. The platform may be unknown; it is never guessed. */
export interface LiveLookupKey {
  id: PlayerId;
  platform: Platform | null;
}

/** What a source emits per player. Composition, not inheritance: the identity can never be spread into a UI row. */
export interface LiveRosterPlayer {
  entry: LiveRosterEntry;
  /**
   * The identity core may use to look up stats; never sent to the UI, never stored.
   * null = the source has no usable id, or withholds it. A source that must not reveal
   * who is private supplies a key for every player or for none.
   */
  lookup: LiveLookupKey | null;
}

export type LiveScore = Record<TeamId, number>;

export interface LiveRound {
  number: number;
  winner: TeamId | null;
  outcome: RoundOutcome | null;
  localSide: Side | null;
  scoreAfter: LiveScore | null;
  localDamage: number | null;
  picks: { slot: number; operatorId: OperatorId | null }[];
}

/**
 * What a LiveMatchSource emits.
 *  - 'status' is the only event that changes the screen state; the others carry data.
 *  - 'roster' always carries the complete roster.
 *  - 'match_started' and 'round_ended' may be emitted again for the same id / round number when late values arrive; the newest wins.
 */
export type LiveMatchEvent = { at: IsoDateTime } & (
  | { type: 'status'; status: LiveStatus; capabilities: LiveCapabilities }
  | { type: 'match_started'; match: LiveMatchInfo }
  | { type: 'roster'; players: LiveRosterPlayer[] }
  | { type: 'score'; score: LiveScore }
  | { type: 'round_started'; number: number; localSide: Side | null }
  | { type: 'round_ended'; round: LiveRound }
  | { type: 'match_ended'; result: MatchResult | null; score: LiveScore | null }
);

export type LiveLookupField =
  | 'level'
  | 'rank'
  | 'rankPoints'
  | 'seasonKd'
  | 'seasonWinRate'
  | 'seasonMatches'
  | 'headshotPct'
  | 'topOperators';

/** What may be shown about players other than me. Declared by the source, enforced in core, obeyed by the UI and by saved matches. */
export interface LiveDisplayPolicy {
  otherPlayerFields: LiveLookupField[]; // columns not listed are not rendered at all
  metBeforeBadge: boolean;
  openProfile: boolean;
}

/** MockLiveMatchSource (phase 5) and OverwolfLiveMatchSource (phase 7) implement this and nothing else. */
export interface LiveMatchSource {
  readonly id: LiveSourceId;
  readonly policy: LiveDisplayPolicy;
  start(): Promise<void>;
  stop(): Promise<void>;
  retry(): Promise<void>;
  subscribe(listener: (event: LiveMatchEvent) => void): Unsubscribe;
}

/** Looked-up profile stats, already cut down by core to what the policy allows. */
export interface LiveProfileStats {
  level: number | null;
  rankId: RankId | null;
  rankPoints: number | null;
  seasonKd: number | null;
  seasonWinRate: Ratio | null;
  seasonMatches: number | null;
  headshotPct: Ratio | null;
  topOperatorIds: OperatorId[] | null;
}

export type LiveLookup =
  | { status: 'pending' }
  | { status: 'ready'; stats: LiveProfileStats }
  | { status: 'unavailable' }; // private, not found and failed are indistinguishable on purpose

export interface LivePlayerRow extends LiveRosterEntry {
  lookup: LiveLookup;
  metBefore: { matches: number; asTeammate: number; asOpponent: number } | null;
  profile: PlayerKey | null; // where a click goes; null = the row is not clickable
}

/** Everything the Live Match screen and the overlay render. Built in core, pushed whole over the bridge. */
export interface LiveMatchView {
  sourceId: LiveSourceId;
  status: LiveStatus;
  capabilities: LiveCapabilities;
  policy: LiveDisplayPolicy;
  match: LiveMatchInfo | null;
  score: LiveScore | null;
  currentRound: number | null;
  localSide: Side | null;
  rounds: LiveRound[];
  players: LivePlayerRow[];
  result: MatchResult | null;
  savedMatchId: MatchId | null; // set once the finished match is in history: the summary screen links to it
}

/** Dev-only scripts for MockLiveMatchSource, so every one of the seven states can be reviewed in phase 5. */
export interface LiveSimulation {
  scenario: 'full_match' | 'unsupported_mode' | 'connection_failed' | 'degraded';
  overwolfRules: boolean; // preview the table as the real source would be allowed to show it
}
