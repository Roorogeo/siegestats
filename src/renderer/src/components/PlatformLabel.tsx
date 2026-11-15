import { Gamepad2, Monitor } from 'lucide-react';
import type { Platform } from '@shared/types/primitives';
import { cn } from '../lib/cn';

/** A platform's name in words: the one list of them in the renderer. */
export const PLATFORM_LABEL: Readonly<Record<Platform, string>> = { pc: 'PC', psn: 'PlayStation', xbl: 'Xbox' };

const SHORT: Readonly<Record<Platform, string>> = { pc: 'PC', psn: 'PS', xbl: 'XB' };

interface PlatformLabelProps {
  platform: Platform;
  /** full = "PlayStation", short = "PS", icon = the icon alone (the full name is its tooltip and accessible name). */
  variant?: 'full' | 'short' | 'icon';
  className?: string;
}

/** The account's platform: an icon (screen for PC, controller for consoles) and its name. No brand marks. */
export function PlatformLabel({ platform, variant = 'full', className }: PlatformLabelProps) {
  const Icon = platform === 'pc' ? Monitor : Gamepad2;
  const name = PLATFORM_LABEL[platform];
  if (variant === 'icon') {
    return (
      <span role="img" aria-label={name} title={name} className={cn('inline-flex text-text-muted', className)}>
        <Icon className="size-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <span title={variant === 'short' ? name : undefined} className={cn('inline-flex items-center gap-1 text-xs text-text-muted whitespace-nowrap', className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {variant === 'short' ? (
        <>
          <span aria-hidden>{SHORT[platform]}</span>
          <span className="sr-only">{name}</span>
        </>
      ) : (
        name
      )}
    </span>
  );
}
