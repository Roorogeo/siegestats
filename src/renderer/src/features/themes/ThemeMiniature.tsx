import { ArrowDown, ArrowUp } from 'lucide-react';
import { memo } from 'react';
import type { Theme } from '@shared/types/theme';
import { ThemeScope } from '../../theme/ThemeScope';

/** Bar heights of the sample chart, one per chart colour (percent of the plot height). */
const BARS = [48, 72, 40, 90, 62, 30, 78, 54] as const;
const CHART_BG = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
  'bg-chart-7',
  'bg-chart-8',
] as const;

/**
 * A live miniature of the app in `theme`: real markup with the ordinary token utilities, rendered inside a
 * ThemeScope, so every colour is that theme's own. It shows each token where the app uses it: the bg plane,
 * a surface card with a border, text and muted text, a surface-2 chip, the 8 chart colours, positive and
 * negative values, a primary button (accent + on-accent) and an accent-text link.
 *
 * Specialty themes get the accent -> accent-2 band along the top of the header; generic themes a plain
 * surface header. The header is the same height either way, and no text ever sits on the gradient.
 *
 * Decorative for assistive technology: the card's own label names the theme.
 */
export const ThemeMiniature = memo(function ThemeMiniature({ theme }: { theme: Theme }) {
  return (
    <ThemeScope theme={theme} aria-hidden className="pointer-events-none bg-bg text-text select-none">
      {/* Header: title bar of the app, in surface. */}
      <div className="flex h-7 flex-col border-b border-border bg-surface">
        {theme.headerGradient ? (
          <div className="h-1.5 shrink-0 bg-linear-to-r from-accent to-accent-2" />
        ) : (
          <div className="h-1.5 shrink-0" />
        )}
        <div className="flex min-h-0 flex-1 items-center gap-1.5 px-2.5">
          <span className="size-2 rounded-full bg-accent" />
          <span className="h-1 w-7 rounded-full bg-text" />
          <span className="ml-auto flex items-center gap-2">
            <span className="flex h-3 flex-col justify-between">
              <span className="h-1 w-5 rounded-full bg-text" />
              <span className="h-0.5 w-5 rounded-full bg-accent" />
            </span>
            <span className="h-1 w-5 rounded-full bg-text-muted" />
            <span className="h-1 w-5 rounded-full bg-text-muted" />
          </span>
        </div>
      </div>

      {/* Page: the bg plane, with one surface card on it. */}
      <div className="p-2.5">
        <div className="space-y-2 rounded-[6px] border border-border bg-surface p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[11px] font-semibold text-text">Overview</div>
              <div className="truncate text-[10px] text-text-muted">Last 30 days</div>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-surface-2 px-1.5 text-[9px] leading-[14px] font-medium text-text-muted">
              Ranked
            </span>
          </div>

          <div className="flex h-7 items-end gap-[3px] border-b border-border">
            {BARS.map((height, i) => (
              <span key={i} className={`flex-1 rounded-t-[2px] ${CHART_BG[i]}`} style={{ height: `${height}%` }} />
            ))}
          </div>

          <div className="flex items-center gap-2 text-[10px] leading-none font-semibold">
            <span className="tabular inline-flex items-center gap-0.5 text-positive">
              <ArrowUp className="size-2.5" strokeWidth={3} />
              12
            </span>
            <span className="tabular inline-flex items-center gap-0.5 text-negative">
              <ArrowDown className="size-2.5" strokeWidth={3} />8
            </span>
            <span className="ml-auto truncate text-accent-text">View more</span>
            <span className="shrink-0 rounded-[4px] bg-accent px-1.5 py-1 text-[9px] font-semibold text-on-accent">Update</span>
          </div>
        </div>
      </div>
    </ThemeScope>
  );
});
