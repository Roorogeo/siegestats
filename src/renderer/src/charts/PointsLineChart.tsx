import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { RankDef } from '@shared/types/game-config';
import { useGame } from '../app/GameConfigProvider';
import { rankLabel, rankState } from '../components/rank-state';
import { formatDateTime, formatNumber, formatShortDate } from '../lib/format';
import { DataTable, Delta, type Column } from '../ui';
import { ChartFrame, TooltipCard } from './ChartFrame';
import { sessionStarts, SESSION_GAP_MS, type PointsDatum } from './points-series';
import { pointsAxis, rankAxis } from './rank-axis';
import { AXIS_PROPS, AXIS_TICK, CHART_COLORS, CHART_SERIES, CROSSHAIR, GRID_PROPS } from './theme';

interface PointsLineChartProps {
  /** Oldest first (pointsSeries() builds it from match history). */
  data: readonly PointsDatum[];
  /** The season's ladder (game.rankSystemFor(seasonId)?.ranks): the y-axis is labelled with its divisions. null = plain points. */
  ranks: readonly RankDef[] | null;
  /** Accessible name of the chart. */
  label: string;
  /** Unit of the points: 'RP' (default) on the ladder, 'points' for a plain-points playlist. */
  unit?: string;
  /** Plot height including axes; default 240. */
  height?: number;
  /** 'linear' (default) or 'step' (points held flat until the next match). */
  curve?: 'linear' | 'step';
  /** Faint vertical divider where matches are further apart than this (a new session); null = none. Default 3 h. */
  sessionGapMs?: number | null;
  /** Click on the chart: the match under the crosshair (e.g. open it). */
  onSelect?(datum: PointsDatum): void;
  busy?: boolean;
  className?: string;
}

const MAX_X_TICKS = 6;

interface Row extends PointsDatum {
  i: number;
}

/** Spreads at most `max` of the candidate indices evenly, always keeping the first. */
function spread(candidates: readonly number[], max: number): number[] {
  if (candidates.length <= max) return [...candidates];
  const every = Math.ceil(candidates.length / max);
  return candidates.filter((_, i) => i % every === 0);
}

/**
 * Date ticks along the match axis: at session starts (where a date change means something), topped up with evenly
 * spaced matches when there are too few sessions to date the axis.
 */
function dateTicks(count: number, starts: readonly number[]): number[] {
  if (count === 0) return [];
  const candidates = [0, ...starts];
  if (candidates.length < 3 && count > 4) {
    for (const share of [1 / 3, 2 / 3]) candidates.push(Math.round((count - 1) * share));
  }
  return spread([...new Set(candidates)].sort((a, b) => a - b), MAX_X_TICKS);
}

/**
 * "Points after every match": one point per match (x = match order, labelled with dates at session starts), a 2 px
 * line in the first series colour, the y-axis on the rank divisions of the config, a crosshair tooltip with the
 * match date, points, change and rank, and the current value labelled at the line's end. One series, so no legend:
 * the surrounding card's title names it. The table view lists every point.
 */
export function PointsLineChart({
  data, ranks, label, unit = 'RP', height = 240, curve = 'linear', sessionGapMs = SESSION_GAP_MS, onSelect, busy = false, className,
}: PointsLineChartProps) {
  const game = useGame();
  const rows = useMemo<Row[]>(() => data.map((d, i) => ({ ...d, i })), [data]);
  const axis = useMemo(() => {
    const values = data.map((d) => d.points);
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const maxTicks = Math.max(3, Math.floor((height - 40) / 22));
    return ranks && ranks.length > 0 ? rankAxis(ranks, min, max, { maxTicks }) : pointsAxis(min, max, { maxTicks: Math.min(6, maxTicks) });
  }, [data, ranks, height]);
  const starts = useMemo(() => sessionStarts(data, sessionGapMs ?? SESSION_GAP_MS), [data, sessionGapMs]);
  const dividers = sessionGapMs === null ? [] : starts;
  const xTicks = useMemo(() => dateTicks(data.length, starts), [data.length, starts]);
  const last = rows.length - 1;
  const color = CHART_SERIES[0];

  // On a ladder, points without a division mean placements (or a ladder the config lacks); on a plain axis, nothing to say.
  const describe = (d: PointsDatum): string => {
    const state = rankState(game, d.rankId, null);
    return state.kind === 'points' || state.kind === 'unranked' ? (ranks ? 'No division yet' : '') : rankLabel(state);
  };

  const renderTooltip = ({ active, activeIndex }: TooltipContentProps) => {
    const row = active && activeIndex !== undefined && activeIndex !== null ? rows[Number(activeIndex)] : undefined;
    if (!row) return null;
    const rank = describe(row);
    return (
      <TooltipCard title={formatDateTime(row.at)}>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-text tabular">
            {formatNumber(row.points)} {unit}
          </span>
          <Delta value={row.delta} unit={unit} />
        </div>
        {rank && <div className="mt-0.5 text-text-muted">{rank}</div>}
      </TooltipCard>
    );
  };

  const columns: Column<Row>[] = [
    { id: 'n', header: '#', cell: (r) => r.i + 1, numeric: true, width: '3rem' },
    { id: 'at', header: 'Match date', cell: (r) => formatDateTime(r.at) },
    { id: 'points', header: unit, cell: (r) => formatNumber(r.points), numeric: true },
    { id: 'delta', header: 'Change', cell: (r) => <Delta value={r.delta} unit={unit} />, numeric: true },
    ...(ranks ? [{ id: 'rank', header: 'Rank', cell: (r: Row) => describe(r) || '–' }] : []),
  ];

  return (
    <ChartFrame
      label={label}
      height={height}
      busy={busy}
      {...(className === undefined ? {} : { className })}
      table={<DataTable label={`${label} (table)`} columns={columns} rows={[...rows].reverse()} rowKey={(r) => `${r.i}`} stickyHeader maxHeight={`${height}px`} />}
    >
      <LineChart
        // The svg's <title>: Recharts' keyboard layer makes the svg a focusable application, which needs a name.
        title={label}
        data={rows}
        margin={{ top: 8, right: 52, bottom: 0, left: 0 }}
        onClick={(state) => {
          const row = state.activeTooltipIndex !== undefined && state.activeTooltipIndex !== null ? rows[Number(state.activeTooltipIndex)] : undefined;
          if (row && onSelect) onSelect(row);
        }}
        {...(onSelect ? { style: { cursor: 'pointer' } } : {})}
      >
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          {...AXIS_PROPS}
          dataKey="i"
          type="number"
          domain={rows.length > 1 ? [0, last] : [-1, 1]}
          ticks={xTicks}
          allowDecimals={false}
          tickFormatter={(value: number) => formatShortDate(rows[value]?.at)}
          interval={0}
          padding={{ left: 6, right: 6 }}
        />
        <YAxis
          {...AXIS_PROPS}
          type="number"
          domain={axis.domain}
          ticks={axis.ticks}
          tickFormatter={axis.label}
          {...(axis.labelsBandAbove
            ? {
                // Rank names sit just above their line, inside the division they name.
                tick: ({ x, y, payload }: { x: number | string; y: number | string; payload: { value: number } }) => (
                  <text x={Number(x)} y={Number(y)} dy={-4} textAnchor="end" {...AXIS_TICK}>
                    {axis.label(payload.value)}
                  </text>
                ),
              }
            : {})}
          interval={0}
          width={axis.kind === 'rank' ? 36 : 48}
          allowDataOverflow
        />
        {dividers.map((start) => (
          <ReferenceLine key={start} x={start - 0.5} stroke={CHART_COLORS.grid} strokeOpacity={0.5} strokeWidth={1} ifOverflow="hidden" />
        ))}
        <Tooltip content={renderTooltip} cursor={CROSSHAIR} isAnimationActive={false} />
        <Line
          type={curve === 'step' ? 'stepAfter' : 'linear'}
          dataKey="points"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          isAnimationActive={false}
          activeDot={{ r: 5, fill: color, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
          dot={(props) => {
            const { cx, cy, index } = props;
            if (index !== last || cx === undefined || cy === undefined) return <g key={`dot-${index}`} />;
            return (
              <g key="end">
                <circle cx={cx} cy={cy} r={4} fill={color} stroke={CHART_COLORS.surface} strokeWidth={2} />
                <text x={cx + 8} y={cy} dy="0.35em" fill={CHART_COLORS.text} fontSize={11} fontWeight={600} className="tabular">
                  {formatNumber(rows[last]?.points ?? null)}
                </text>
              </g>
            );
          }}
        />
      </LineChart>
    </ChartFrame>
  );
}
