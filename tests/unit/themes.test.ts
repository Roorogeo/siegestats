import { describe, expect, test } from 'vitest';
import {
  CHART_L_BAND,
  CHART_MIN_CONTRAST,
  CONTROL_CONTRAST,
  DEFAULT_THEME_ID,
  TEXT_CONTRAST,
  THEMES,
  THEME_CATEGORIES,
  color,
  getTheme,
  resolveActiveTheme,
  themesInCategory,
  tokensToCssVars,
} from '@shared/theme';
import type { ThemeId } from '@shared/types/primitives';
import type { ThemeSettings } from '@shared/types/theme';
import briefThemes from './fixtures/brief-themes.json';
import { cvdDeltaE, deltaE } from './cvd';

const planes = (t: (typeof THEMES)[number]): string[] => [t.tokens.bg, t.tokens.surface, t.tokens.surface2];
const worst = (fg: string, backgrounds: string[]): number => Math.min(...backgrounds.map((bg) => color.contrast(fg, bg)));

describe('theme table', () => {
  test('has the 56 themes of the brief, in order, with the listed colours', () => {
    expect(THEMES).toHaveLength(56);
    const actual = THEMES.map(({ id, name, category, mode, bg, surface, accent, accent2 }) => ({
      id, name, category, mode, bg, surface, accent, accent2,
    }));
    expect(actual).toEqual(briefThemes);
  });

  test('has 6 generic themes and 10 in each specialty category', () => {
    expect(THEME_CATEGORIES.map((c) => themesInCategory(c.id).length)).toEqual([6, 10, 10, 10, 10, 10]);
  });

  test('ids are unique and the default exists', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(56);
    expect(getTheme(DEFAULT_THEME_ID).id).toBe('graphite');
    expect(getTheme('no-such-theme').id).toBe(DEFAULT_THEME_ID);
  });

  test('the four listed colours reach the tokens unchanged', () => {
    for (const t of THEMES) {
      expect([t.tokens.bg, t.tokens.surface, t.tokens.accent, t.tokens.accent2]).toEqual([t.bg, t.surface, t.accent, t.accent2]);
    }
  });

  test('only specialty themes use the header gradient', () => {
    for (const t of THEMES) expect(t.headerGradient).toBe(t.category !== 'generic');
  });

  test('High Contrast has white borders', () => {
    expect(getTheme('high-contrast').tokens.border).toBe('#FFFFFF');
  });
});

describe.each(THEMES.map((t) => [t.id, t] as const))('contrast: %s', (_id, t) => {
  test('text colours read at 4.5:1 or better on bg, surface and surface-2', () => {
    expect(worst(t.tokens.text, planes(t))).toBeGreaterThanOrEqual(7);
    expect(worst(t.tokens.textMuted, planes(t))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(worst(t.tokens.accentText, planes(t))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(worst(t.tokens.positive, planes(t))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(worst(t.tokens.negative, planes(t))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  test('control edges reach 3:1 on bg, surface and surface-2', () => {
    expect(worst(t.tokens.controlBorder, planes(t))).toBeGreaterThanOrEqual(CONTROL_CONTRAST);
  });

  test('text on the accent reads at 4.5:1 or better', () => {
    expect(color.contrast(t.tokens.onAccent, t.tokens.accent)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  test('accent-text is the accent itself wherever the accent already reads as text', () => {
    if (worst(t.tokens.accent, planes(t)) >= TEXT_CONTRAST) expect(t.tokens.accentText).toBe(t.tokens.accent);
    expect(color.hueDistance(color.toOklch(t.tokens.accentText).h, color.toOklch(t.tokens.accent).h)).toBeLessThan(12);
  });

  test('surface-2 and border are distinct from the surface', () => {
    expect(t.tokens.surface2).not.toBe(t.tokens.surface);
    expect(color.contrast(t.tokens.border, t.tokens.surface)).toBeGreaterThan(1.25);
  });

  test('chart palette: 8 distinct colours that pass the categorical checks on this surface', () => {
    const chart = [...t.tokens.chart];
    expect(new Set(chart).size).toBe(8);
    const [min, max] = CHART_L_BAND[t.mode];
    for (const hex of chart) {
      const { l, c } = color.toOklch(hex);
      expect(l).toBeGreaterThanOrEqual(min - 0.005);
      expect(l).toBeLessThanOrEqual(max + 0.005);
      expect(c).toBeGreaterThanOrEqual(0.1); // below this a hue reads as grey
      expect(color.contrast(hex, t.tokens.surface)).toBeGreaterThanOrEqual(CHART_MIN_CONTRAST);
    }
    // Neighbours in the fixed order must stay apart for full-colour and for red-green colour-blind readers.
    for (let i = 0; i < chart.length - 1; i += 1) {
      const a = chart[i] as string;
      const b = chart[i + 1] as string;
      expect(deltaE(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(15);
      expect(cvdDeltaE(a, b), `${a} vs ${b} (colour-blind)`).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('css variables', () => {
  test('one variable per token plus the 8 chart colours', () => {
    const vars = tokensToCssVars(getTheme('graphite').tokens);
    expect(Object.keys(vars).sort()).toEqual(
      [
        '--accent', '--accent-2', '--accent-text', '--bg', '--border', '--control-border', '--negative', '--on-accent', '--positive',
        '--surface', '--surface-2', '--text', '--text-muted',
        '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-7', '--chart-8',
      ].sort(),
    );
    expect(vars['--accent']).toBe('#4C8DFF');
  });
});

describe('match Windows light/dark', () => {
  const base: ThemeSettings = {
    activeThemeId: 'ember' as ThemeId,
    favoriteThemeIds: [],
    matchSystem: false,
    systemLightThemeId: 'daylight' as ThemeId,
    systemDarkThemeId: 'midnight' as ThemeId,
  };

  test('off: the chosen theme is used whatever Windows says', () => {
    expect(resolveActiveTheme(base, 'light').id).toBe('ember');
    expect(resolveActiveTheme(base, 'dark').id).toBe('ember');
  });

  test('on: Windows picks between the two generic themes', () => {
    const on = { ...base, matchSystem: true };
    expect(resolveActiveTheme(on, 'light').id).toBe('daylight');
    expect(resolveActiveTheme(on, 'dark').id).toBe('midnight');
  });

  test('on: a non-generic or wrong-mode choice falls back to the default pair', () => {
    const bad = { ...base, matchSystem: true, systemLightThemeId: 'ember' as ThemeId, systemDarkThemeId: 'daylight' as ThemeId };
    expect(resolveActiveTheme(bad, 'light').id).toBe('daylight');
    expect(resolveActiveTheme(bad, 'dark').id).toBe('graphite');
  });
});
