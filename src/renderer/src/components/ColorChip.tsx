import type { CSSProperties, ReactNode } from 'react';
import { color as colorMath } from '@shared/theme';
import type { HexColor } from '@shared/types/primitives';
import { cn } from '../lib/cn';

/**
 * The art of every game badge: initials on a colour from the game config (rank tiers, operators, maps). Those colours
 * are data, the same in every theme, so they are applied as inline style from the config value, with black or white
 * text, whichever reads better on it. A 1px edge in the control-border token (at least 3:1 on bg, surface and
 * surface-2 in every theme) keeps a pale chip's shape visible on a pale surface. `color` null draws the neutral chip
 * used for unknown and unranked states.
 */
export function ColorChip({
  color, children, className, style, edge = true,
}: {
  color: HexColor | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** false: no edge of its own, for a chip cut by a clip-path (which would cut the outline too); the caller draws one. */
  edge?: boolean;
}) {
  const paint: CSSProperties | undefined = color === null ? undefined : { backgroundColor: color, color: colorMath.readableTextOn(color) };
  return (
    <span
      aria-hidden
      style={{ ...paint, ...style }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center leading-none font-semibold tracking-tight select-none',
        edge && 'outline-1 -outline-offset-1 outline-control-border',
        color === null && 'bg-surface-2 text-text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export type BadgeSize = 'sm' | 'md' | 'lg';
