import { useState, type CSSProperties } from 'react';
import type { PlayerRef } from '@shared/types/player';
import { hashSeed } from '@shared/util/random';
import { cn } from '../lib/cn';
import { playerInitials } from '../lib/format';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  player: Pick<PlayerRef, 'id' | 'name' | 'avatarUrl'>;
  size?: AvatarSize;
  /** false = never load the provider's image, initials only (Live Match, design question 20). */
  remote?: boolean;
  /** Accessible name. Omit when the name is written next to the avatar (the default): it is then hidden. */
  label?: string;
  className?: string;
}

const BOX: Record<AvatarSize, string> = {
  sm: 'size-5 text-[9px]',
  md: 'size-7 text-[11px]',
  lg: 'size-10 text-sm',
  xl: 'size-16 text-xl',
};

/** One of the theme's eight chart colours, picked by a stable hash of the account id: the same player, the same colour. */
export const avatarSlot = (playerId: string): number => (hashSeed('avatar', playerId) % 8) + 1;

/**
 * Initials from the player's name on a tint of a colour derived from their id (design question 20). The provider's
 * image is used only when it gives an https URL; if it fails to load, the initials show instead.
 */
export function Avatar({ player, size = 'md', remote = true, label, className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = remote && player.avatarUrl !== null && /^https:\/\//i.test(player.avatarUrl) && failed !== player.avatarUrl ? player.avatarUrl : null;
  const slot = avatarSlot(player.id);
  const style: CSSProperties = {
    backgroundColor: `color-mix(in oklab, var(--chart-${slot}) 30%, var(--surface-2))`,
    outlineColor: `color-mix(in oklab, var(--chart-${slot}) 70%, transparent)`,
  };
  const named = label !== undefined;
  return (
    <span
      role={named ? 'img' : undefined}
      aria-label={label}
      aria-hidden={named ? undefined : true}
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-text outline-1 -outline-offset-1 select-none',
        BOX[size],
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailed(url)} />
      ) : (
        playerInitials(player.name)
      )}
    </span>
  );
}
