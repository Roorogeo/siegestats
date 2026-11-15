import type { RankDef } from '@shared/types/game-config';
import { formatNumber } from '../lib/format';

/**
 * Y-axes for points charts. Pure (no DOM, no Recharts): unit-tested in tests/unit/rank-axis.test.ts.
 *
 * rankAxis puts the ticks, and so the horizontal gridlines, on the division boundaries of a rank system from the
 * game config and labels each with the short name of the division that starts there ("G3"): the line is where the
 * player enters that division. The domain runs from the boundary under the lowest value to the boundary over the
 * highest, so the plotted line always sits inside the divisions it crossed.
 */
export interface PointsAxis {
  kind: 'rank' | 'points';
  domain: [number, number];
  ticks: number[];
  label(value: number): string;
  /**
   * true (rank axes): a label names the band above its tick, the division that starts on that line, so it is drawn
   * just above the line. The top tick closes the last band and has no label. false: a label is the tick's value.
   */
  labelsBandAbove: boolean;
}

export interface AxisOptions {
  /** Most ticks to label; with more boundaries in range, tier starts are kept first. Default 9. */
  maxTicks?: number;
}

const DEFAULT_MAX_TICKS = 9;

/** Keeps at most `max` ticks: all when they fit, else the preferred ones, thinned evenly if still too many. */
function thin(ticks: readonly number[], preferred: readonly number[], max: number): number[] {
  if (ticks.length <= max) return [...ticks];
  const base = preferred.length >= 2 ? preferred : ticks;
  if (base.length <= max) return [...base];
  const every = Math.ceil(base.length / max);
  return base.filter((_, i) => i % every === 0);
}

/** A clean step (1, 2 or 5 times a power of ten) giving at most `count` intervals over `span`. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/** Plain numeric axis (Legend Division points, or a season whose ladder is not in the config). */
export function pointsAxis(min: number, max: number, options: AxisOptions = {}): PointsAxis {
  const maxTicks = Math.max(2, options.maxTicks ?? 6);
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
  if (hi === lo) [lo, hi] = [lo - 1, hi + 1];
  const step = niceStep(hi - lo, maxTicks - 1);
  const from = Math.floor(lo / step) * step;
  const to = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = from; v <= to + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { kind: 'points', domain: [from, to], ticks, label: (value) => formatNumber(value), labelsBandAbove: false };
}

/**
 * Division-boundary axis for `ranks` (one rank system's divisions, lowest first, contiguous, as the config
 * validator guarantees) over the data range [min, max]. Falls back to pointsAxis when there are no ranks.
 */
export function rankAxis(ranks: readonly RankDef[], min: number, max: number, options: AxisOptions = {}): PointsAxis {
  const first = ranks[0];
  if (!first || !Number.isFinite(min) || !Number.isFinite(max)) return pointsAxis(min, max, options);
  const maxTicks = Math.max(2, options.maxTicks ?? DEFAULT_MAX_TICKS);
  const lowValue = Math.min(min, max);
  const highValue = Math.max(min, max);
  const second = ranks[1];
  const width = second ? second.minPoints - first.minPoints : 100;

  const indexAt = (points: number): number => {
    let found = -1;
    ranks.forEach((rank, i) => {
      if (rank.minPoints <= points) found = i;
    });
    return found;
  };

  const lowIndex = indexAt(lowValue);
  const lo = lowIndex >= 0 ? (ranks[lowIndex]?.minPoints ?? first.minPoints) : Math.floor(lowValue / width) * width;

  const highIndex = indexAt(highValue);
  const above = ranks[highIndex + 1];
  let hi: number;
  if (highIndex < 0) hi = first.minPoints;
  else if (above) hi = above.minPoints;
  else {
    // The open-ended top division: room up to the next round step over the highest value.
    const top = ranks[highIndex]?.minPoints ?? first.minPoints;
    hi = top + width * Math.max(1, Math.ceil((highValue - top + 1) / width));
  }
  if (hi <= lo) hi = lo + width;

  const inRange = ranks.filter((rank) => rank.minPoints >= lo && rank.minPoints <= hi);
  const boundaries = inRange.map((rank) => rank.minPoints);
  if (boundaries[0] !== lo) boundaries.unshift(lo);
  const tierStarts = inRange
    .filter((rank) => {
      const i = ranks.indexOf(rank);
      return i === 0 || ranks[i - 1]?.tierId !== rank.tierId;
    })
    .map((rank) => rank.minPoints);

  const names = new Map(ranks.map((rank) => [rank.minPoints, rank.shortName]));
  return {
    kind: 'rank',
    domain: [lo, hi],
    ticks: thin(boundaries, tierStarts, maxTicks),
    label: (value) => (value >= hi ? '' : (names.get(value) ?? formatNumber(value))),
    labelsBandAbove: true,
  };
}
