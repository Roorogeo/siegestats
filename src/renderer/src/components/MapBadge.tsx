import type { MapId } from '@shared/types/primitives';
import { useGame } from '../app/GameConfigProvider';
import { cn } from '../lib/cn';
import { ColorChip, type BadgeSize } from './ColorChip';

interface MapBadgeProps {
  /** null or an id the config does not know: the "unknown map" badge. */
  mapId: MapId | null;
  size?: BadgeSize;
  withName?: boolean;
  className?: string;
}

/** Landscape, so a map never looks like an operator. */
const BOX: Record<BadgeSize, string> = {
  sm: 'h-[18px] w-7 rounded-[3px] text-[9px]',
  md: 'h-6 w-9 rounded-[4px] text-[10px]',
  lg: 'h-8 w-12 rounded-[5px] text-xs',
};
const NAME: Record<BadgeSize, string> = { sm: 'text-xs', md: 'text-[13px]', lg: 'text-[15px]' };

/** Initials on the map's colour from the config. Accessible name: the map's name. */
export function MapBadge({ mapId, size = 'md', withName = false, className }: MapBadgeProps) {
  const game = useGame();
  const map = mapId === null ? null : game.map(mapId);
  const label = map?.name ?? 'Unknown map';
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex min-w-0 items-center gap-1.5 align-middle', className)}>
      <ColorChip color={map?.color ?? null} className={BOX[size]}>
        {map?.initials ?? '?'}
      </ColorChip>
      {withName && (
        <span aria-hidden className={cn('min-w-0 truncate text-text', NAME[size])}>
          {label}
        </span>
      )}
    </span>
  );
}
