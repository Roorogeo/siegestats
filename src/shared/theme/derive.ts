import type { HexColor } from '../types/primitives';
import type { Theme, ThemeSeed, ThemeTokens } from '../types/theme';
import { deriveChartPalette } from './chart-palette';
import { contrast, ensureContrast, mix } from './color';

/** Minimum contrast for anything that is read as text. */
export const TEXT_CONTRAST = 4.5;
/** Minimum contrast for the parts of a control that show where it is (WCAG 1.4.11). */
export const CONTROL_CONTRAST = 3;
/** Body text aims higher than the minimum. */
const BODY_TEXT_CONTRAST = 7;

const WHITE = '#FFFFFF';
const BLACK = '#000000';
const NEAR_BLACK = '#0B0B0B';

/** Status hues are fixed: they mean good / bad in every theme and always come with an arrow or a sign. */
const STATUS = {
  dark: { positive: '#3DD68C', negative: '#FF6B6B' },
  light: { positive: '#15803D', negative: '#C62828' },
} as const;

/** White or near-black, whichever reads better; pure black is the fallback and always clears 4.5:1 where white does not. */
function pickOnAccent(accent: string): HexColor {
  const white = contrast(WHITE, accent);
  const nearBlack = contrast(NEAR_BLACK, accent);
  if (white >= TEXT_CONTRAST && white >= nearBlack) return WHITE;
  if (nearBlack >= TEXT_CONTRAST) return NEAR_BLACK;
  return white >= TEXT_CONTRAST ? WHITE : BLACK;
}

/**
 * Every token the brief does not list is computed here from bg / surface / accent / accent-2.
 * Rules, in order:
 *   surface-2   one step past surface, away from bg (hover rows, inputs, nested panels)
 *   text        near-white or near-black, tinted by the surface, at least 7:1 on all three planes
 *   text-muted  text pulled toward the surface, at least 4.5:1 on all three planes
 *   border      surface pulled toward text
 *   on-accent   black or white, whichever reads better on the accent (always above 4.5:1)
 *   accent-text the accent stepped in lightness until it reads at 4.5:1 as text; equals accent where it already does
 *   control-border  the border stepped until it reaches 3:1 on all planes: the edge of inputs and an unchecked switch
 *   positive / negative  fixed status hues stepped to 4.5:1
 *   chart       see chart-palette.ts
 * `overrides` on the seed win over all of it.
 */
export function deriveTokens(seed: ThemeSeed): ThemeTokens {
  const dark = seed.mode === 'dark';
  const direction = dark ? 'lighter' : 'darker';
  const { bg, surface, accent, accent2 } = seed;

  const surface2 = seed.overrides.surface2 ?? (dark ? mix(surface, WHITE, 0.07) : mix(surface, BLACK, 0.05));
  const planes = [bg, surface, surface2];

  const text =
    seed.overrides.text ??
    ensureContrast(dark ? mix(WHITE, surface, 0.08) : mix(BLACK, surface, 0.1), planes, BODY_TEXT_CONTRAST, direction);
  const textMuted = ensureContrast(mix(text, surface, 0.36), planes, TEXT_CONTRAST, direction);
  const border = seed.overrides.border ?? mix(surface, text, dark ? 0.16 : 0.18);
  const status = STATUS[seed.mode];

  const derived: ThemeTokens = {
    bg,
    surface,
    surface2,
    border,
    text,
    textMuted,
    accent,
    accent2,
    onAccent: pickOnAccent(accent),
    accentText: ensureContrast(accent, planes, TEXT_CONTRAST, direction),
    controlBorder: ensureContrast(border, planes, CONTROL_CONTRAST, direction),
    positive: ensureContrast(status.positive, planes, TEXT_CONTRAST, direction),
    negative: ensureContrast(status.negative, planes, TEXT_CONTRAST, direction),
    chart: deriveChartPalette(accent, surface, seed.mode),
  };
  return { ...derived, ...seed.overrides };
}

export function buildTheme(seed: ThemeSeed): Theme {
  return {
    ...seed,
    tokens: deriveTokens(seed),
    // Specialty themes paint the profile header with an accent -> accent-2 gradient.
    headerGradient: seed.category !== 'generic',
  };
}
