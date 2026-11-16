import type { RankId } from '@shared/types/primitives';
import type { RankPoint } from '@shared/types/stats';
import { useGame } from '../app/GameConfigProvider';
import { cn } from '../lib/cn';
import { formatNumber } from '../lib/format';
import { ColorChip, type BadgeSize } from './ColorChip';
import { rankLabel, rankState } from './rank-state';

/** Where the badge gets its rank: a RankPoint (profiles, matches, boards) or a bare rank id (search results). */
type RankSource = { rank: RankPoint | null } | { rankId: RankId | null; points?: number | null };

type RankBadgeProps = RankSource & {
  size?: BadgeSize;
  /** Also writes the rank name (and points) beside the chip. */
  withName?: boolean;
  /** Unit after the points: 'RP' on the Ranked ladder (default), 'points' for a plain-points playlist. */
  unit?: string;
  /**
   * Starts the accessible name with the chip's short name ("S5 Silver V"), for a row whose name is read from its
   * content: that name then holds what the row shows. The tooltip stays the full name.
   */
  shortNameInLabel?: boolean;
  className?: string;
};

const CHIP: Record<BadgeSize, string> = {
  sm: 'h-[18px] min-w-7 rounded-[4px] px-1 text-[10px]',
  md: 'h-6 min-w-9 rounded-[5px] px-1.5 text-[11px]',
  lg: 'h-9 min-w-12 rounded-control px-2 text-sm',
};
const NAME: Record<BadgeSize, string> = { sm: 'text-xs', md: 'text-[13px]', lg: 'text-[15px]' };

/**
 * Original rank badge: the tier's colour from the config with the division's short name ("G3") on it, in black or
 * white for contrast. No game art. Sizes sm / md / lg; the full name and points are the tooltip and accessible name.
 */
export function RankBadge(props: RankBadgeProps) {
  const game = useGame();
  const { size = 'md', withName = false, unit = 'RP', shortNameInLabel = false, className } = props;
  const [rankId, points] = 'rank' in props ? [props.rank?.rankId ?? null, props.rank?.points ?? null] : [props.rankId, props.points ?? null];
  const state = rankState(game, rankId, points);
  const label = rankLabel(state, unit);
  // A points chip's name already starts with its number; unranked and unknown show a mark ("–", "?"), not a word.
  const name = shortNameInLabel && state.kind === 'rank' ? `${state.shortName} ${label}` : label;

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
    <span role="img" aria-label={name} title={label} className={cn('inline-flex min-w-0 items-center gap-1.5 align-middle', className)}>
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
