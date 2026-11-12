declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

// Opaque ids. All except PlayerId / MatchId are keys into the game config.
export type PlayerId = Brand<string, 'PlayerId'>; // the data source's stable account id, never a display name
export type MatchId = Brand<string, 'MatchId'>;
export type SeasonId = Brand<string, 'SeasonId'>; // "Y11S3"
export type PlaylistId = Brand<string, 'PlaylistId'>; // "ranked", "legend-division"
export type OperatorId = Brand<string, 'OperatorId'>;
export type MapId = Brand<string, 'MapId'>;
export type RankId = Brand<string, 'RankId'>; // one division, unique across all rank systems: "r3.gold-3"
export type RankTierId = Brand<string, 'RankTierId'>;
export type RankSystemId = Brand<string, 'RankSystemId'>;
export type RegionId = Brand<string, 'RegionId'>;
export type ThemeId = Brand<string, 'ThemeId'>;

export type IsoDateTime = Brand<string, 'IsoDateTime'>; // UTC ISO-8601 string
export type HexColor = `#${string}`;
export type Ratio = number; // 0..1; "54.2%" is formatting

export type Platform = 'pc' | 'psn' | 'xbl'; // the account's platform
export type PlatformFamily = 'pc' | 'console'; // the rank / matchmaking pool
export type LeaderboardScope = 'global' | PlatformFamily;
export type Side = 'attack' | 'defense';
/** Two team labels. Live captures: blue = my team. Provider matches: assigned by the provider, no point of view implied. */
export type TeamId = 'blue' | 'orange';
export type ProviderId = 'mock' | 'live';
export type Unsubscribe = () => void;

/**
 * Conventions for every type below
 *  - `T | null`: the data source does not expose this. The UI renders "-", never 0.
 *  - Query filters are required fields that take 'all' / 'current'; nothing is optional.
 *  - Only counts are stored. K/D, win rate, kills per match are computed by shared/util/stats.ts
 *    (which returns null for a zero denominator), so they can never disagree with the counts.
 *  - Plain JSON-safe data only: it crosses IPC and goes into SQLite unchanged.
 */
