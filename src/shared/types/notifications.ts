import type { IsoDateTime, MatchId, SeasonId } from './primitives';
import type { PlayerRef } from './player';
import type { RankPoint } from './stats';
import type { MatchResult } from './match';

export type NotificationPayload =
  | { kind: 'favorite_rank_changed'; player: PlayerRef; from: RankPoint | null; to: RankPoint | null }
  | { kind: 'match_saved'; matchId: MatchId; result: MatchResult; score: { own: number; opponent: number } }
  | { kind: 'season_started'; seasonId: SeasonId };

export type AppNotification = NotificationPayload & {
  id: string;
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
};
