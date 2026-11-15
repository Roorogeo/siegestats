import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { GameIndex } from '@shared/game-config';
import type { Side } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { OperatorStats } from '@shared/types/stats';
import { kd, roundWinRate } from '@shared/util/stats';
import { useGame } from '../../../app/GameConfigProvider';
import { OperatorBadge, SIDE_LABEL } from '../../../components';
import { DASH, formatKd, formatNumber, formatRatio } from '../../../lib/format';
import { useOperators } from '../../../queries';
import { DataTable, QueryState, SectionCard, SegmentedControl, type Column } from '../../../ui';
import { CardTitle } from '../overview/CardTitle';
import { StatsFilterBar } from './StatsFilterBar';
import { seasonLabel, statsQuery, useFilterOptions, useStatsFilters } from './stats-filters';

type SideChoice = 'all' | Side;
const SIDE_PARAM = 'oside';
const SIDE_OPTIONS: { id: SideChoice; label: string }[] = [
  { id: 'all', label: 'Both sides' },
  { id: 'attack', label: 'Attack' },
  { id: 'defense', label: 'Defense' },
];

const readSide = (params: URLSearchParams): SideChoice => {
  const raw = params.get(SIDE_PARAM);
  return raw === 'attack' || raw === 'defense' ? raw : 'all';
};

/** The operator's side from the config: OperatorStats has none. null = both sides, or an operator the config lacks. */
const sideOf = (game: GameIndex, row: OperatorStats): Side | null => game.operator(row.operatorId)?.side ?? null;

function operatorColumns(game: GameIndex): Column<OperatorStats>[] {
  return [
    {
      id: 'operator',
      header: 'Operator',
      cell: (o) => <OperatorBadge operatorId={o.operatorId} size="sm" withName />,
      sortValue: (o) => game.operator(o.operatorId)?.name ?? o.operatorId,
      firstDirection: 'asc',
    },
    {
      id: 'side',
      header: 'Side',
      cell: (o) => {
        const side = sideOf(game, o);
        return <span className="text-text-muted">{side ? SIDE_LABEL[side] : game.operator(o.operatorId) ? 'Both' : DASH}</span>;
      },
      sortValue: (o) => sideOf(game, o),
      firstDirection: 'asc',
    },
    { id: 'rounds', header: 'Rounds', numeric: true, cell: (o) => formatNumber(o.rounds), sortValue: (o) => o.rounds },
    {
      id: 'roundWr',
      header: 'Round WR',
      numeric: true,
      cell: (o) => formatRatio(roundWinRate(o.roundsWon, o.rounds)),
      sortValue: (o) => roundWinRate(o.roundsWon, o.rounds),
    },
    { id: 'kd', header: 'K/D', numeric: true, cell: (o) => formatKd(kd(o.kills, o.deaths)), sortValue: (o) => kd(o.kills, o.deaths) },
    { id: 'kills', header: 'Kills', numeric: true, cell: (o) => formatNumber(o.kills), sortValue: (o) => o.kills },
    {
      id: 'hs',
      header: <abbr title="Headshot percentage" className="no-underline">HS%</abbr>,
      numeric: true,
      cell: (o) => formatRatio(o.headshotPct),
      sortValue: (o) => o.headshotPct,
    },
  ];
}

const DEFAULT_SORT = { columnId: 'rounds', direction: 'desc' } as const;

/**
 * The Operators tab: one row per operator for the chosen season and playlist (every map), most-played first, sortable
 * by any column. The side filter works on the config's side of each operator; the badge's shape shows it too.
 */
export function OperatorsTab({ player }: { player: PlayerKey }) {
  const game = useGame();
  const [filters, setFilters] = useStatsFilters('o');
  const options = useFilterOptions(player, filters);
  const [params, setParams] = useSearchParams();
  const side = readSide(params);
  const operators = useOperators(statsQuery(player, filters), { keepPrevious: true });
  const columns = useMemo(() => operatorColumns(game), [game]);

  const setSide = (next: SideChoice): void =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (next === 'all') out.delete(SIDE_PARAM);
        else out.set(SIDE_PARAM, next);
        return out;
      },
      { preventScrollReset: true },
    );

  // An operator the config lists for both sides (side null) belongs to either; one the config lacks, to neither.
  const onSide = (rows: readonly OperatorStats[]): OperatorStats[] =>
    side === 'all'
      ? [...rows]
      : rows.filter((o) => {
          const own = sideOf(game, o);
          return own === side || (own === null && game.operator(o.operatorId) !== null);
        });

  const scope = `${filters.seasonId === 'all' ? 'all seasons' : seasonLabel(game, filters.seasonId)}${
    filters.playlistId === 'all' ? '' : `, ${game.playlist(filters.playlistId)?.name ?? filters.playlistId}`
  }`;
  const played = options.record ? options.record.overall.matches > 0 : null;
  const sideWord = side === 'all' ? 'operator' : side === 'attack' ? 'attacker' : 'defender';

  return (
    <SectionCard title={<CardTitle>Operators</CardTitle>} subtitle="Counted over the rounds each operator was picked" flush>
      <StatsFilterBar filters={filters} options={options} onChange={setFilters}>
        <SegmentedControl label="Side" size="sm" options={SIDE_OPTIONS} value={side} onChange={setSide} />
      </StatsFilterBar>
      <QueryState
        query={operators}
        compact
        loadingLabel="Loading operators"
        skeleton={
          <div className="border-t border-border">
            <DataTable label="Operators" columns={columns} rows={undefined} rowKey={(o) => o.operatorId} skeletonRows={8} />
          </div>
        }
        isEmpty={(data) => onSide(data.data).length === 0}
        empty={{
          title: `No ${sideWord} stats for ${scope}`,
          description:
            played === true && filters.playlistId === 'all' && side === 'all'
              ? 'The data source has no per-operator breakdown for this season.'
              : 'Try another season, playlist or side.',
        }}
      >
        {(data) => {
          const rows = onSide(data.data);
          const rounds = rows.reduce((sum, o) => sum + o.rounds, 0);
          return (
            <>
              <div className="border-t border-border">
                <DataTable
                  label={`Operators, ${scope}`}
                  columns={columns}
                  rows={rows}
                  rowKey={(o) => o.operatorId}
                  defaultSort={DEFAULT_SORT}
                  busy={operators.isPlaceholderData}
                />
              </div>
              <p className="border-t border-border px-4 py-2.5 text-xs text-text-muted tabular">
                {formatNumber(rows.length)} {rows.length === 1 ? 'operator' : 'operators'}, {formatNumber(rounds)} rounds
              </p>
            </>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}
