/**
 * Chart colours, all theme variables, so a chart follows the theme (and a ThemeScope preview) with no re-render.
 * The categorical palette is the theme's validated --chart-1..8, assigned in fixed order; text never wears a series
 * colour.
 */
export const CHART_SERIES = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)',
] as const;

export const CHART_COLORS = {
  /**
   * Gridlines and axis lines: one quiet step off the card surface. Not the border token, which High Contrast sets to
   * white for panel edges: a white grid would outshout the data.
   */
  grid: 'color-mix(in oklab, var(--text-muted) 24%, var(--surface))',
  axisText: 'var(--text-muted)',
  text: 'var(--text)',
  surface: 'var(--surface)',
  cursor: 'var(--text-muted)',
  positive: 'var(--positive)',
  negative: 'var(--negative)',
} as const;

/** Axis tick text: muted, 11 px, tabular figures. */
export const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: 11, fontVariantNumeric: 'tabular-nums' } as const;

/** Recessive axes: no tick marks, a hairline baseline. Spread onto <XAxis> / <YAxis>. */
export const AXIS_PROPS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.grid },
  tickMargin: 6,
} as const;

/** Hairline, solid, horizontal-only gridlines. Spread onto <CartesianGrid>. */
export const GRID_PROPS = { stroke: CHART_COLORS.grid, strokeWidth: 1, vertical: false } as const;

/** The crosshair of line and area charts. Pass as <Tooltip cursor>. */
export const CROSSHAIR = { stroke: CHART_COLORS.cursor, strokeWidth: 1 } as const;
