import { useMemo } from 'react';
import type { GameIndex } from '@shared/game-config';
import type { PlaylistDef } from '@shared/types/game-config';
import type { SeasonId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { OperatorStats, PlaylistStats, RankPoint, SeasonRecord } from '@shared/types/stats';
import { kd, winRate } from '@shared/util/stats';
import { useCurrentSeason, useGame } from '../../../app/GameConfigProvider';
import { OperatorBadge, RankBadge } from '../../../components';
import { DASH, formatKd, formatNumber, formatRatio } from '../../../lib/format';
import { useSeasons } from '../../../queries';
import { Badge, DataTable, SectionCard, type Column } from '../../../ui';
import { ladderPlaylist, ladderRankText, ladderStats, pointsUnit, type PlacementsText } from '../overview/ladder';

/** A rank cell. With ranked matches but no rank, it says placements (as the Overview does) instead of "Unranked". */
function Rank({ rank, unit = 'RP', placements = null }: { rank: RankPoint | null; unit?: string; placements?: PlacementsText | null }) {
  if (rank === null && placements !== null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="flex">
          <RankBadge rank={null} size="sm" />
        </span>
        <span className="text-text">{placements}</span>
      </span>
    );
  }
  return <RankBadge rank={rank} size="sm" withName unit={unit} />;
}

function seasonColumns(game: GameIndex, ladder: PlaylistDef | null, currentId: SeasonId): Column<SeasonRecord>[] {
  const standing = (r: SeasonRecord) => ladderStats(r, ladder)?.standing ?? null;
  const placements = (r: SeasonRecord) => ladderRankText(ladderStats(r, ladder), r.seasonId === currentId);
  return [
    {
      id: 'season',
      header: 'Season',
      cell: (r) => {
        const season = game.season(r.seasonId);
        return (
          <span className="flex items-center gap-2">
            <span className="text-text">{season?.name ?? r.seasonId}</span>
            {season && <span className="text-xs text-text-muted">{season.id}</span>}
            {r.seasonId === currentId && <Badge>Current</Badge>}
          </span>
        );
      },
      sortValue: (r) => game.season(r.seasonId)?.number ?? null,
    },
    {
      id: 'rank',
      header: 'Final rank',
      cell: (r) => <Rank rank={standing(r)?.rank ?? null} placements={placements(r)} />,
      sortValue: (r) => standing(r)?.rank?.points ?? null,
    },
    {
      id: 'peak',
      header: 'Peak rank',
      cell: (r) => <Rank rank={standing(r)?.peak ?? null} placements={placements(r)} />,
      sortValue: (r) => standing(r)?.peak?.points ?? null,
    },
    { id: 'matches', header: 'Matches', numeric: true, cell: (r) => formatNumber(r.overall.matches), sortValue: (r) => r.overall.matches },
    {
      id: 'wr',
      header: 'Win rate',
      numeric: true,
      cell: (r) => formatRatio(winRate(r.overall.wins, r.overall.losses)),
      sortValue: (r) => winRate(r.overall.wins, r.overall.losses),
    },
    {
      id: 'kd',
      header: 'K/D',
      numeric: true,
      cell: (r) => formatKd(kd(r.overall.kills, r.overall.deaths)),
      sortValue: (r) => kd(r.overall.kills, r.overall.deaths),
    },
  ];
}

/** The playlists of one season; isCurrent says whether it is the season in force (for the placements wording). */
function playlistColumns(game: GameIndex, ladder: PlaylistDef | null, isCurrent: boolean): Column<PlaylistStats>[] {
  const placements = (p: PlaylistStats) => (p.playlistId === ladder?.id ? ladderRankText(p, isCurrent) : null);
  return [
    { id: 'playlist', header: 'Playlist', cell: (p) => <span className="text-text">{game.playlist(p.playlistId)?.name ?? 'Unknown playlist'}</span> },
    { id: 'matches', header: 'Matches', numeric: true, cell: (p) => formatNumber(p.matches) },
    { id: 'wl', header: <abbr title="Wins and losses" className="no-underline">W-L</abbr>, numeric: true, cell: (p) => `${formatNumber(p.wins)}-${formatNumber(p.losses)}` },
    { id: 'wr', header: 'Win rate', numeric: true, cell: (p) => formatRatio(winRate(p.wins, p.losses)) },
    { id: 'kd', header: 'K/D', numeric: true, cell: (p) => formatKd(kd(p.kills, p.deaths)) },
    { id: 'hs', header: <abbr title="Headshot percentage" className="no-underline">HS%</abbr>, numeric: true, cell: (p) => formatRatio(p.headshotPct) },
    {
      id: 'rank',
      header: 'Final rank',
      cell: (p) =>
        p.standing ? (
          <Rank rank={p.standing.rank} unit={pointsUnit(game, p.playlistId)} placements={placements(p)} />
        ) : (
          <span className="text-text-muted">{DASH}</span>
        ),
    },
    {
      id: 'peak',
      header: 'Peak',
      cell: (p) =>
        p.standing ? (
          <Rank rank={p.standing.peak} unit={pointsUnit(game, p.playlistId)} placements={placements(p)} />
        ) : (
          <span className="text-text-muted">{DASH}</span>
        ),
    },
  ];
}

function BestOperator({ label, operator }: { label: string; operator: OperatorStats | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <span className="text-text-muted">{label}</span>
      {operator ? (
        <>
          <OperatorBadge operatorId={operator.operatorId} size="sm" withName />
          <span className="text-text-muted tabular">{formatNumber(operator.rounds)} rounds</span>
        </>
      ) : (
        <span className="text-text-muted">{DASH}</span>
      )}
    </div>
  );
}

function SeasonDetail({ record, ladder, isCurrent, name }: { record: SeasonRecord; ladder: PlaylistDef | null; isCurrent: boolean; name: string }) {
  const game = useGame();
  const columns = useMemo(() => playlistColumns(game, ladder, isCurrent), [game, ladder, isCurrent]);
  const rows = [...record.byPlaylist].sort((a, b) => b.matches - a.matches);
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 whitespace-normal">
      <div className="rounded-card border border-border bg-surface">
        <DataTable
          label={`${name} by playlist`}
          columns={columns}
          rows={rows}
          rowKey={(p) => p.playlistId}
          empty={<p className="px-3 py-4 text-center text-xs text-text-muted">The data source has no playlist breakdown for this season.</p>}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        <BestOperator label="Best attacker" operator={record.bestAttacker} />
        <BestOperator label="Best defender" operator={record.bestDefender} />
      </div>
    </div>
  );
}

const DEFAULT_SORT = { columnId: 'season', direction: 'desc' } as const;

/**
 * The Seasons tab: one row per season played, newest first, with the final (or, this season, current) and peak rank
 * on the Ranked ladder, matches, win rate and K/D. A row opens its playlist breakdown and best operators.
 */
export function SeasonsTab({ player }: { player: PlayerKey }) {
  const game = useGame();
  const seasons = useSeasons(player);
  const currentId = useCurrentSeason().id;
  const ladder = ladderPlaylist(game);
  const columns = useMemo(() => seasonColumns(game, ladder, currentId), [game, ladder, currentId]);
  const nameOf = (record: SeasonRecord): string => game.season(record.seasonId)?.name ?? record.seasonId;

  return (
    <SectionCard
      title="Seasons"
      subtitle="Ranks are on the Ranked ladder; the current season shows the rank now. Open a season for its playlists."
      flush
      query={seasons}
      loadingLabel="Loading seasons"
      skeleton={
        <div className="border-t border-border">
          <DataTable label="Seasons" columns={columns} rows={undefined} rowKey={(r) => r.seasonId} detail={() => null} />
        </div>
      }
      isEmpty={(data) => data.data.length === 0}
      empty={{ title: 'No seasons played', description: 'Seasons this account has played show here.' }}
    >
      {(data) => (
        <div className="border-t border-border">
          <DataTable
            label="Seasons"
            columns={columns}
            rows={data.data}
            rowKey={(r) => r.seasonId}
            defaultSort={DEFAULT_SORT}
            detailLabel={(r) => `Playlists of ${nameOf(r)}`}
            detail={(r) => <SeasonDetail record={r} ladder={ladder} isCurrent={r.seasonId === currentId} name={nameOf(r)} />}
          />
        </div>
      )}
    </SectionCard>
  );
}
