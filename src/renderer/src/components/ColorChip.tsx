import type { CSSProperties, ReactNode } from 'react';
import { color as colorMath } from '@shared/theme';
import type { HexColor } from '@shared/types/primitives';
import { cn } from '../lib/cn';

/**
 * The art of every game badge: initials on a colour from the game config (rank tiers, operators, maps). Those colours
 * are data, the same in every theme, so they are applied as inline style from the config value, with black or white
 * text, whichever reads better on it. A faint edge in the theme's text colour keeps a pale chip visible on a pale
 * surface. `color` null draws the neutral chip used for unknown and unranked states.
 */
export function ColorChip({
  color, children, className, style,
}: {
  color: HexColor | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const paint: CSSProperties | undefined = color === null ? undefined : { backgroundColor: color, color: colorMath.readableTextOn(color) };
  return (
    <span
      aria-hidden
      style={{ ...paint, ...style }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center leading-none font-semibold tracking-tight select-none',
        'outline-1 -outline-offset-1',
        color === null ? 'bg-surface-2 text-text-muted outline-control-border' : 'outline-[color-mix(in_oklab,var(--text)_22%,transparent)]',
        className,
      )}
    >
      {children}
    </span>
  );
}

export type BadgeSize = 'sm' | 'md' | 'lg';
