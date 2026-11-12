import type { IsoDateTime, Platform, PlayerId, RankId } from './primitives';
import type { MatchStats, SeasonRecord } from './stats';

/** One account on one platform. Route param, cache key and SQLite key. */
export interface PlayerKey {
  platform: Platform;
  id: PlayerId;
}

export interface PlayerRef extends PlayerKey {
  name: string;
  avatarUrl: string | null; // null -> initials avatar
}

export interface PlayerSearchQuery {
  name: string;
  platform: Platform;
  limit: number;
}

export interface PlayerSearchResult extends PlayerRef {
  level: number | null;
  rankId: RankId | null;
  lastPlayedAt: IsoDateTime | null;
  exactMatch: boolean;
}

export interface PlayerProfile {
  player: PlayerRef;
  level: number | null;
  lastPlayedAt: IsoDateTime | null;
  currentSeason: SeasonRecord;
  lifetime: MatchStats | null;
  /**
   * The same person's accounts on other platforms, as asserted by the data source.
   * null = the source does not expose links. [] = it does and there are none.
   * The app never infers a link.
   */
  linkedAccounts: PlayerRef[] | null;
}
