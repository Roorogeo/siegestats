import type { OperatorId, Side } from '@shared/types/primitives';
import { useGame } from '../app/GameConfigProvider';
import { cn } from '../lib/cn';
import { ColorChip, type BadgeSize } from './ColorChip';

interface OperatorBadgeProps {
  /** null or an id the config does not know: the "unknown operator" badge. */
  operatorId: OperatorId | null;
  size?: BadgeSize;
  /** Also writes the operator's name beside the badge. */
  withName?: boolean;
  className?: string;
}

const BOX: Record<BadgeSize, string> = {
  sm: 'size-5 text-[9px]',
  md: 'size-6 text-[10px]',
  lg: 'size-8 text-xs',
};
const NAME: Record<BadgeSize, string> = { sm: 'text-xs', md: 'text-[13px]', lg: 'text-[15px]' };

/**
 * Attack and defence differ in shape, not only in the side named in the label, so they can be told apart without
 * colour: attackers have the top-right corner cut off (a point forward), defenders a rounded shield-like bottom.
 */
const SHAPE: Record<Side | 'both', string> = {
  attack: 'rounded-[3px] [clip-path:polygon(0_0,62%_0,100%_38%,100%_100%,0_100%)]',
  defense: 'rounded-t-[3px] rounded-b-[45%]',
  both: 'rounded-[3px]',
};

/**
 * The attacker's edge: a clip-path cuts an outline off along the cut corner, so the 1px control-border edge is drawn
 * as four drop-shadows on a wrapper, which follow the clipped shape on every side, the diagonal included.
 */
const CLIPPED_EDGE =
  'inline-flex shrink-0 [filter:drop-shadow(1px_0_0_var(--control-border))_drop-shadow(-1px_0_0_var(--control-border))_drop-shadow(0_1px_0_var(--control-border))_drop-shadow(0_-1px_0_var(--control-border))]';

export const SIDE_LABEL: Readonly<Record<Side, string>> = { attack: 'Attacker', defense: 'Defender' };

/** Initials on the operator's colour from the config, shaped by side. Accessible name: "Ash, attacker". */
export function OperatorBadge({ operatorId, size = 'md', withName = false, className }: OperatorBadgeProps) {
  const game = useGame();
  const operator = operatorId === null ? null : game.operator(operatorId);
  const label = operator ? `${operator.name}${operator.side ? `, ${SIDE_LABEL[operator.side].toLowerCase()}` : ''}` : 'Unknown operator';
  const side = operator?.side ?? 'both';
  const chip = (
    <ColorChip color={operator?.color ?? null} edge={side !== 'attack'} className={cn(BOX[size], SHAPE[side])}>
      {operator?.initials ?? '?'}
    </ColorChip>
  );
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex min-w-0 items-center gap-1.5 align-middle', className)}>
      {side === 'attack' ? (
        <span className={CLIPPED_EDGE}>{chip}</span>
      ) : (
        chip
      )}
      {withName && (
        <span aria-hidden className={cn('min-w-0 truncate text-text', NAME[size])}>
          {operator?.name ?? 'Unknown'}
        </span>
      )}
    </span>
  );
}
