import { useMemo } from 'react';
import type { TeamId } from '@shared/types/primitives';
import { cn } from '../../lib/cn';
import { useTheme } from '../../theme/ThemeProvider';
import { teamSlots } from './team-slots';

/**
 * Team colours. The game calls its teams Blue and Orange, so each is drawn in the theme's own blue and orange chart
 * colours (--chart-N), wherever those sit in this theme's palette: the palette keeps eight hue families in one fixed
 * order and only starts the cycle at the family nearest the accent. The colours are for marks (swatches, bars), never
 * for text, which always says the team's name as well.
 */

const BG = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6', 'bg-chart-7', 'bg-chart-8'] as const;

/** Background utility per team for the active theme. */
export function useTeamColors(): Readonly<Record<TeamId, string>> {
  const { theme } = useTheme();
  return useMemo(() => {
    const slots = teamSlots(theme);
    return { blue: BG[slots.blue] ?? BG[0], orange: BG[slots.orange] ?? BG[1] };
  }, [theme]);
}

/** A small square in the team's colour, beside the team's name (decorative: the name carries the meaning). */
export function TeamSwatch({ team, className }: { team: TeamId; className?: string }) {
  const colors = useTeamColors();
  return <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-[3px]', colors[team], className)} />;
}
