import { formatNumber } from '../../../lib/format';
import type { StatsFilters } from './stats-filters';

interface CoverageNoteProps {
  /** What the table's rows add up to. */
  shown: number;
  /** What the season records say the scope holds (scopeTotal); null = unknown. */
  total: number | null;
  unit: 'matches' | 'rounds';
  /** "map" / "operator": what the breakdown is per. */
  per: string;
  filters: StatsFilters;
}

/**
 * Under a per-map or per-operator table whose rows add up to less than the season records hold: the source has no
 * breakdown for part of the scope, so the table is not the whole picture. Nothing when the totals agree.
 */
export function CoverageNote({ shown, total, unit, per, filters }: CoverageNoteProps) {
  if (total === null || shown >= total) return null;
  const where = filters.seasonId === 'all' ? `no per-${per} breakdown for some seasons` : `no full per-${per} breakdown for this season`;
  return (
    <p className="mt-1 text-xs text-text-muted">
      <span className="tabular">
        Covers {formatNumber(shown)} of {formatNumber(total)} {unit}
      </span>
      : the data source has {where}.
    </p>
  );
}
