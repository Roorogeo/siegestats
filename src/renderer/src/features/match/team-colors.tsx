import { useMemo } from 'react';
import { CHART_FAMILIES, color, deriveChartPalette } from '@shared/theme';
import type { TeamId } from '@shared/types/primitives';
import type { Theme } from '@shared/types/theme';
import { cn } from '../../lib/cn';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Team colours. The game calls its teams Blue and Orange, so each is drawn in the theme's own blue and orange chart
 * colours (--chart-N), wherever those sit in this theme's palette: the palette keeps eight hue families in one fixed
 * order and only starts the cycle at the family nearest the accent. The colours are for marks (swatches, bars), never
 * for text, which always says the team's name as well.
 */

const BG = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6', 'bg-chart-7', 'bg-chart-8'] as const;

const FAMILY_OF_TEAM: Readonly<Record<TeamId, (typeof CHART_FAMILIES)[number]>> = { blue: 'blue', orange: 'orange' };

/** Index (0..7) of the theme's chart colour closest in hue to each family's reference colour. */
function teamSlots(theme: Theme): Record<TeamId, number> {
  // A grey accent starts the cycle at the first family, so this palette lists the families in CHART_FAMILIES order.
  const neutral = color.fromOklch({ l: 0.6, c: 0, h: 0 });
  const reference = deriveChartPalette(neutral, theme.tokens.surface, theme.mode);
  const hues = theme.tokens.chart.map((hex) => color.toOklch(hex).h);
  const slotOf = (team: TeamId): number => {
    const target = color.toOklch(reference[CHART_FAMILIES.indexOf(FAMILY_OF_TEAM[team])] ?? reference[0]).h;
    let best = 0;
    hues.forEach((hue, i) => {
      if (color.hueDistance(hue, target) < color.hueDistance(hues[best] ?? hue, target)) best = i;
    });
    return best;
  };
  return { blue: slotOf('blue'), orange: slotOf('orange') };
}

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
