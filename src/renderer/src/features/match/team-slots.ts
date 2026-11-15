import { CHART_FAMILIES, color, deriveChartPalette } from '@shared/theme';
import type { TeamId } from '@shared/types/primitives';
import type { Theme } from '@shared/types/theme';

const FAMILY_OF_TEAM: Readonly<Record<TeamId, (typeof CHART_FAMILIES)[number]>> = { blue: 'blue', orange: 'orange' };

/**
 * Index (0..7) of the theme's chart colour (--chart-N) that draws each team: the one closest in hue to its family's
 * reference colour (blue for Blue, orange for Orange). team-colors.tsx turns the slots into utilities.
 */
export function teamSlots(theme: Theme): Record<TeamId, number> {
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
