import type { ReactNode } from 'react';
import { FilterSelect } from './FilterSelect';
import type { FilterOptions, StatsFilters } from './stats-filters';

interface StatsFilterBarProps {
  filters: StatsFilters;
  options: FilterOptions;
  onChange(patch: Partial<StatsFilters>): void;
  /** More controls after the two selects (the side filter). */
  children?: ReactNode;
}

/** The season and playlist selects of the Operators and Maps tabs, in one row above their table. */
export function StatsFilterBar({ filters, options, onChange, children }: StatsFilterBarProps) {
  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3">
      <FilterSelect label="Season" value={filters.seasonId} options={options.seasons} onChange={(seasonId) => onChange({ seasonId })} />
      <FilterSelect label="Playlist" value={filters.playlistId} options={options.playlists} onChange={(playlistId) => onChange({ playlistId })} />
      {children}
    </div>
  );
}
