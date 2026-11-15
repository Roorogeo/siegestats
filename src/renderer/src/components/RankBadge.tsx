import type { HexColor, RankId } from '@shared/types/primitives';
import type { RankPoint } from '@shared/types/stats';
import type { GameIndex } from '@shared/game-config';
import { useGame } from '../app/GameConfigProvider';
import { cn } from '../lib/cn';
import { formatNumber } from '../lib/format';
import { ColorChip, type BadgeSize } from './ColorChip';

/** Where the badge gets its rank: a RankPoint (profiles, matches, boards) or a bare rank id (search results). */
type RankSource = { rank: RankPoint | null } | { rankId: RankId | null; points?: number | null };

type RankBadgeProps = RankSource & {
  size?: BadgeSize;
  /** Also writes the rank name (and points) beside the chip. */
  withName?: boolean;
  /** Unit after the points: 'RP' on the Ranked ladder (default), 'points' for a plain-points playlist. */
  unit?: string;
  className?: string;
};

const CHIP: Record<BadgeSize, string> = {
  sm: 'h-[18px] min-w-7 rounded-[4px] px-1 text-[10px]',
  md: 'h-6 min-w-9 rounded-[5px] px-1.5 text-[11px]',
  lg: 'h-9 min-w-12 rounded-control px-2 text-sm',
};
const NAME: Record<BadgeSize, string> = { sm: 'text-xs', md: 'text-[13px]', lg: 'text-[15px]' };

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

/**
 * Original rank badge: the tier's colour from the config with the division's short name ("G3") on it, in black or
 * white for contrast. No game art. Sizes sm / md / lg; the full name and points are the tooltip and accessible name.
 */
export function RankBadge(props: RankBadgeProps) {
  const game = useGame();
  const { size = 'md', withName = false, unit = 'RP', className } = props;
  const [rankId, points] = 'rank' in props ? [props.rank?.rankId ?? null, props.rank?.points ?? null] : [props.rankId, props.points ?? null];
  const state = rankState(game, rankId, points);
  const label = rankLabel(state, unit);

  const chip =
    state.kind === 'rank' ? (
      <ColorChip color={state.color} className={CHIP[size]}>
        {state.shortName}
      </ColorChip>
    ) : state.kind === 'points' ? (
      <ColorChip color={null} className={cn(CHIP[size], 'text-text tabular')}>
        {formatNumber(state.points)}
      </ColorChip>
    ) : (
      <ColorChip color={null} className={CHIP[size]}>
        {state.kind === 'unknown' ? '?' : '–'}
      </ColorChip>
    );

  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex min-w-0 items-center gap-1.5 align-middle', className)}>
      {chip}
      {withName && (
        <span aria-hidden className={cn('min-w-0 truncate text-text', NAME[size])}>
          {state.kind === 'rank' ? state.name : state.kind === 'points' ? unit : state.kind === 'unknown' ? 'Unknown rank' : 'Unranked'}
          {state.kind !== 'unranked' && state.kind !== 'points' && state.points !== null && (
            <span className="ml-1.5 text-text-muted tabular">
              {formatNumber(state.points)} {unit}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
