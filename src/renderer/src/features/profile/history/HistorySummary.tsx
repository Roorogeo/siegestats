import type { ReactNode } from 'react';
import type { MatchHistorySummary } from '@shared/types/match';
import type { SeasonId } from '@shared/types/primitives';
import { kd, killsPerMatch, winRate } from '@shared/util/stats';
import { cn } from '../../../lib/cn';
import { DASH, formatKd, formatNumber, formatRatio } from '../../../lib/format';
import { Delta, Skeleton } from '../../../ui';
import type { PointsUnit } from '../overview/ladder';

function Item({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-xs text-text-muted" title={title}>
        {label}
      </dt>
      <dd className="truncate text-[15px] leading-6 font-semibold text-text tabular">{children}</dd>
    </div>
  );
}

/** "W3" / "L2": the letter carries the result, the colour only repeats it. */
function Streak({ streak }: { streak: MatchHistorySummary['streak'] }) {
  if (!streak) return <>{DASH}</>;
  const win = streak.result === 'win';
  const spoken = `${streak.length} ${win ? (streak.length === 1 ? 'win' : 'wins') : streak.length === 1 ? 'loss' : 'losses'} in a row`;
  return (
    <span className={win ? 'text-positive' : 'text-negative'}>
      <span aria-hidden>
        {win ? 'W' : 'L'}
        {streak.length}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

const GRID = 'grid grid-cols-3 gap-x-4 gap-y-3 @2xl:grid-cols-6';

interface HistorySummaryProps {
  summary: MatchHistorySummary;
  /** 'RP' when the change is on the Ranked ladder, 'points' for a plain-points playlist only (Legend Division). */
  pointsUnit: PointsUnit;
  /**
   * The season the points change covers, named in its label ("RP change (Y11S3)") when the period also reaches into
   * earlier seasons, whose points are not added. null = no name (the "Season" period, or a period inside one season).
   */
  pointsSeasonId?: SeasonId | null;
  busy?: boolean;
  className?: string;
}

/**
 * The summary row: matches, the current W/L streak inside the period, the points change (summed inside the season
 * of the newest points match, never across a reset), win rate, K/D and kills per match. Every figure covers the
 * whole filtered period (all pages), as the provider computed it; the ratios are derived here from its counts with
 * shared/util/stats.
 */
export function HistorySummary({ summary, pointsUnit, pointsSeasonId = null, busy = false, className }: HistorySummaryProps) {
  const pointsLabel = pointsUnit === 'RP' ? 'RP change' : 'Points change';
  return (
    <dl className={cn(GRID, busy && 'opacity-60 transition-opacity', className)}>
      <Item label="Matches">{formatNumber(summary.matches)}</Item>
      <Item label="Streak">
        <Streak streak={summary.streak} />
      </Item>
      <Item
        label={pointsSeasonId === null ? pointsLabel : `${pointsLabel} (${pointsSeasonId})`}
        {...(pointsSeasonId === null ? {} : { title: `${pointsSeasonId} only: points from earlier seasons are not added` })}
      >
        <Delta value={summary.pointsChange} unit={pointsUnit} />
      </Item>
      <Item label="Win rate">{formatRatio(winRate(summary.wins, summary.losses))}</Item>
      <Item label="K/D">{formatKd(kd(summary.kills, summary.deaths))}</Item>
      <Item label="Kills per match">{formatNumber(killsPerMatch(summary.kills, summary.matches), 1)}</Item>
    </dl>
  );
}

export function HistorySummarySkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn(GRID, className)}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5 py-0.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}
