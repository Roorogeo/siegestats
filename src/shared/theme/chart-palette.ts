import type { HexColor } from '../types/primitives';
import type { ThemeMode } from '../types/theme';
import { contrast, fromOklch, hueDistance, toOklch } from './color';

/**
 * The 8-colour categorical chart palette of a theme.
 *
 * Eight hue families in one fixed order (the order is what keeps neighbours apart for
 * colour-blind readers). A theme does not invent hues: it starts the same cycle at the family
 * closest to its accent, and each colour is stepped in lightness, hue held, until it clears
 * 3:1 against that theme's surface.
 */
export const CHART_FAMILIES = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red'] as const;

const BASE: Record<ThemeMode, readonly HexColor[]> = {
  light: ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#6250D6', '#E34948'],
  dark: ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'],
};

/** OKLCH lightness a categorical colour may use in each mode. */
export const CHART_L_BAND: Record<ThemeMode, readonly [number, number]> = {
  light: [0.43, 0.77],
  dark: [0.48, 0.67],
};
export const CHART_MIN_CONTRAST = 3;
/** Below this chroma an accent has no usable hue (greys, near-whites); the cycle then starts at blue. */
const MIN_ACCENT_CHROMA = 0.06;

export type ChartPalette = readonly [HexColor, HexColor, HexColor, HexColor, HexColor, HexColor, HexColor, HexColor];

function startIndex(accent: string, mode: ThemeMode): number {
  const a = toOklch(accent);
  if (a.c < MIN_ACCENT_CHROMA) return 0;
  let best = 0;
  let bestDistance = Infinity;
  BASE[mode].forEach((hex, i) => {
    const d = hueDistance(a.h, toOklch(hex).h);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

/** Steps lightness toward readable (lighter on dark surfaces, darker on light ones) inside the band. */
function stepForContrast(hex: HexColor, surface: string, mode: ThemeMode): HexColor {
  if (contrast(hex, surface) >= CHART_MIN_CONTRAST) return hex;
  const [min, max] = CHART_L_BAND[mode];
  const color = toOklch(hex);
  const step = mode === 'dark' ? 0.005 : -0.005;
  let best = hex;
  for (let l = color.l + step; l >= min && l <= max; l += step) {
    best = fromOklch({ ...color, l });
    if (contrast(best, surface) >= CHART_MIN_CONTRAST) return best;
  }
  return best;
}

export function deriveChartPalette(accent: string, surface: string, mode: ThemeMode): ChartPalette {
  const base = BASE[mode];
  const start = startIndex(accent, mode);
  const ordered = [...base.slice(start), ...base.slice(0, start)];
  return ordered.map((hex) => stepForContrast(hex, surface, mode)) as unknown as ChartPalette;
}
