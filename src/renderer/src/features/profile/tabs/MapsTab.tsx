import { useMemo } from 'react';
import type { GameIndex } from '@shared/game-config';
import type { PlayerKey } from '@shared/types/player';
import type { MapStats } from '@shared/types/stats';
import { kd, winRate } from '@shared/util/stats';
import { useGame } from '../../../app/GameConfigProvider';
import { MapBadge } from '../../../components';
import { formatKd, formatNumber, formatRatio } from '../../../lib/format';
import { useMaps } from '../../../queries';
import { DataTable, QueryState, SectionCard, type Column } from '../../../ui';
import { CardTitle } from '../overview/CardTitle';
import { StatsFilterBar } from './StatsFilterBar';
import { seasonLabel, statsQuery, useFilterOptions, useStatsFilters } from './stats-filters';

function mapColumns(game: GameIndex): Column<MapStats>[] {
  return [
    {
      id: 'map',
      header: 'Map',
      cell: (m) => <MapBadge mapId={m.mapId} size="sm" withName />,
      sortValue: (m) => game.map(m.mapId)?.name ?? m.mapId,
      firstDirection: 'asc',
    },
    { id: 'matches', header: 'Matches', numeric: true, cell: (m) => formatNumber(m.matches), sortValue: (m) => m.matches },
    {
      id: 'wl',
      header: <abbr title="Wins and losses" className="no-underline">W-L</abbr>,
      numeric: true,
      cell: (m) => `${formatNumber(m.wins)}-${formatNumber(m.losses)}`,
      sortValue: (m) => m.wins - m.losses,
    },
    { id: 'wr', header: 'Win rate', numeric: true, cell: (m) => formatRatio(winRate(m.wins, m.losses)), sortValue: (m) => winRate(m.wins, m.losses) },
    { id: 'kd', header: 'K/D', numeric: true, cell: (m) => formatKd(kd(m.kills, m.deaths)), sortValue: (m) => kd(m.kills, m.deaths) },
    { id: 'rounds', header: 'Rounds', numeric: true, cell: (m) => formatNumber(m.rounds), sortValue: (m) => m.rounds },
    {
      id: 'hs',
      header: <abbr title="Headshot percentage" className="no-underline">HS%</abbr>,
      numeric: true,
      cell: (m) => formatRatio(m.headshotPct),
      sortValue: (m) => m.headshotPct,
    },
  ];
}

const DEFAULT_SORT = { columnId: 'matches', direction: 'desc' } as const;

/** The Maps tab: one row per map for the chosen season and playlist, most-played first, sortable by any column. */
export function MapsTab({ player }: { player: PlayerKey }) {
  const game = useGame();
  const [filters, setFilters] = useStatsFilters('m');
  const options = useFilterOptions(player, filters);
  const maps = useMaps(statsQuery(player, filters), { keepPrevious: true });
  const columns = useMemo(() => mapColumns(game), [game]);

  const scope = `${filters.seasonId === 'all' ? 'all seasons' : seasonLabel(game, filters.seasonId)}${
    filters.playlistId === 'all' ? '' : `, ${game.playlist(filters.playlistId)?.name ?? filters.playlistId}`
  }`;
  const played = options.record ? options.record.overall.matches > 0 : null;

  return (
    <SectionCard title={<CardTitle>Maps</CardTitle>} subtitle="Matches, results and rounds per map" flush>
      <StatsFilterBar filters={filters} options={options} onChange={setFilters} />
      <QueryState
        query={maps}
        compact
        loadingLabel="Loading maps"
        skeleton={
          <div className="border-t border-border">
            <DataTable label="Maps" columns={columns} rows={undefined} rowKey={(m) => m.mapId} skeletonRows={8} />
          </div>
        }
        isEmpty={(data) => data.data.length === 0}
        empty={{
          title: `No map stats for ${scope}`,
          description:
            played === true && filters.playlistId === 'all'
              ? 'The data source has no per-map breakdown for this season.'
              : 'Try another season or playlist.',
        }}
      >
        {(data) => {
          const matches = data.data.reduce((sum, m) => sum + m.matches, 0);
          return (
            <>
              <div className="border-t border-border">
                <DataTable
                  label={`Maps, ${scope}`}
                  columns={columns}
                  rows={data.data}
                  rowKey={(m) => m.mapId}
                  defaultSort={DEFAULT_SORT}
                  busy={maps.isPlaceholderData}
                />
              </div>
              <p className="border-t border-border px-4 py-2.5 text-xs text-text-muted tabular">
                {formatNumber(data.data.length)} {data.data.length === 1 ? 'map' : 'maps'}, {formatNumber(matches)} matches
              </p>
            </>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}
