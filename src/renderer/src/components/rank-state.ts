import type { GameIndex } from '@shared/game-config';
import type { HexColor, RankId } from '@shared/types/primitives';
import { formatNumber } from '../lib/format';

export type RankState =
  | { kind: 'rank'; rankId: RankId; name: string; shortName: string; color: HexColor; points: number | null }
  | { kind: 'points'; points: number }
  | { kind: 'unknown'; points: number | null }
  | { kind: 'unranked' };

/**
 * What a rank shows as, from the config: a division (tier colour + short name); points without a division
 * (rankId null: a 'plain' playlist such as Legend Division, a ladder still in placements, or a ladder missing from
 * the config); a rank id the config does not know; or unranked.
 */
export function rankState(game: GameIndex, rankId: RankId | null, points: number | null): RankState {
  if (rankId === null) return points === null ? { kind: 'unranked' } : { kind: 'points', points };
  const rank = game.rank(rankId);
  const tier = game.tierOf(rankId);
  if (!rank || !tier) return { kind: 'unknown', points };
  return { kind: 'rank', rankId, name: rank.name, shortName: rank.shortName, color: tier.color, points };
}

/** The badge's accessible name and tooltip: "Gold III, 2,458 RP", "1,234 points", "Unknown rank", "Unranked". */
export function rankLabel(state: RankState, unit = 'RP'): string {
  const pts = (points: number | null): string => (points === null ? '' : `, ${formatNumber(points)} ${unit}`);
  switch (state.kind) {
    case 'rank':
      return `${state.name}${pts(state.points)}`;
    case 'points':
      return `${formatNumber(state.points)} ${unit}`;
    case 'unknown':
      return `Unknown rank${pts(state.points)}`;
    case 'unranked':
      return 'Unranked';
  }
}
