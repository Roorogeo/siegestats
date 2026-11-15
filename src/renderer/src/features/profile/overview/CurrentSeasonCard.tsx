import { useId } from 'react';
import type { PlaylistDef } from '@shared/types/game-config';
import type { Side } from '@shared/types/primitives';
import type { OperatorStats, PlaylistStats, SeasonRecord } from '@shared/types/stats';
import { kd, roundWinRate, winRate } from '@shared/util/stats';
import { useCurrentSeason, useGame } from '../../../app/GameConfigProvider';
import { OperatorBadge, RankBadge, rankState, SIDE_LABEL } from '../../../components';
import { formatKd, formatNumber, formatRatio } from '../../../lib/format';
import type { StatsResult } from '../../../queries';
import { DataTable, SectionCard, ShowMoreButton, Skeleton, StatTile, SubHeading, useShowMore, type Column } from '../../../ui';
import { ladderPlaylist, ladderRankText, ladderStats, POOL_LABEL } from './ladder';
import { ProfileFailedNote } from './ProfileFailedNote';

/** Playlists listed before "Show more". */
const PLAYLISTS_SHOWN = 3;

function CurrentSeasonSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[74px] w-full rounded-card" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

/**
 * The Ranked standing: division badge, name and RP (the season's peak is in the Peak ranks card beside it). With no
 * division yet it says why, from the data alone (ladderRankText): placements (ranked matches played, no rank yet) or
 * unranked (no ranked matches).
 */
function RankCell({ stats, isCurrent }: { stats: PlaylistStats | null; isCurrent: boolean }) {
  const game = useGame();
  const rank = stats?.standing?.rank ?? null;
  const state = rankState(game, rank?.rankId ?? null, rank?.points ?? null);
  const played = stats?.matches ?? 0;

  let name: string;
  let detail: string;
  switch (state.kind) {
    case 'rank':
      name = state.name;
      detail = `${formatNumber(state.points)} RP`;
      break;
    case 'points':
      name = `${formatNumber(state.points)} RP`;
      detail = 'Division not in the game data';
      break;
    case 'unknown':
      name = 'Unknown rank';
      detail = `${formatNumber(state.points)} RP`;
      break;
    case 'unranked':
      name = ladderRankText(stats, isCurrent) ?? 'Unranked';
      detail = played > 0 ? `${formatNumber(played)} ranked ${played === 1 ? 'match' : 'matches'}` : 'No ranked matches';
      break;
  }

  return (
    <div role="group" aria-label="Rank" className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <div aria-hidden className="text-xs font-medium text-text-muted">
        Rank
      </div>
      <div className="flex min-w-0 items-center gap-2.5">
        {/* The words beside it say the same, placements included, so the badge itself is not announced. */}
        <span aria-hidden className="flex shrink-0">
          <RankBadge rank={rank} size="lg" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] leading-5 font-semibold text-text">{name}</span>
          <span className="truncate text-xs text-text-muted tabular">{detail}</span>
        </div>
      </div>
    </div>
  );
}

function OperatorCell({ side, stats }: { side: Side; stats: OperatorStats | null }) {
  const game = useGame();
  const label = side === 'attack' ? 'Best attacker' : 'Best defender';
  if (!stats) {
    return (
      <div className="flex min-w-0 flex-col justify-center rounded-control bg-surface-2 px-3 py-2">
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-[13px] text-text-muted">No {SIDE_LABEL[side].toLowerCase()} rounds this season</span>
      </div>
    );
  }
  const name = game.operator(stats.operatorId)?.name ?? 'Unknown operator';
  return (
    <div role="group" aria-label={label} className="flex min-w-0 items-center gap-3 rounded-control bg-surface-2 px-3 py-2">
      <OperatorBadge operatorId={stats.operatorId} size="lg" />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-text-muted">
          {label}
          <span aria-hidden className="text-text"> · {name}</span>
        </span>
        <span className="truncate text-xs text-text-muted">
          <span className="font-medium text-text tabular">{formatNumber(stats.rounds)}</span> rounds ·{' '}
          <span className="font-medium text-text tabular">{formatRatio(roundWinRate(stats.roundsWon, stats.rounds))}</span> won ·{' '}
          <span className="font-medium text-text tabular">{formatKd(kd(stats.kills, stats.deaths))}</span> K/D
        </span>
      </div>
    </div>
  );
}

function PlaylistTable({ rows }: { rows: readonly PlaylistStats[] }) {
  const game = useGame();
  const tableId = useId();
  const sorted = [...rows].sort((a, b) => b.matches - a.matches);
  const more = useShowMore(sorted, PLAYLISTS_SHOWN);
  const columns: Column<PlaylistStats>[] = [
    { id: 'playlist', header: 'Playlist', cell: (r) => <span className="text-text">{game.playlist(r.playlistId)?.name ?? 'Unknown playlist'}</span> },
    { id: 'matches', header: 'Matches', cell: (r) => formatNumber(r.matches), numeric: true, width: '6rem' },
    { id: 'kd', header: 'K/D', cell: (r) => formatKd(kd(r.kills, r.deaths)), numeric: true, width: '6rem' },
    { id: 'wr', header: 'Win rate', cell: (r) => formatRatio(winRate(r.wins, r.losses)), numeric: true, width: '6rem' },
  ];
  return (
    <div className="flex min-w-0 flex-col">
      <SubHeading>By playlist</SubHeading>
      <div id={tableId} className="min-w-0">
        <DataTable label="This season by playlist" columns={columns} rows={more.visible} rowKey={(r) => r.playlistId} />
      </div>
      <ShowMoreButton state={more} controls={tableId} noun={more.hiddenCount === 1 ? 'playlist' : 'playlists'} className="mt-1 self-start" />
    </div>
  );
}

function CurrentSeasonBody({ record, ladder }: { record: SeasonRecord; ladder: PlaylistDef | null }) {
  const isCurrent = record.seasonId === useCurrentSeason().id;
  const o = record.overall;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] divide-x divide-border rounded-card border border-border">
        <RankCell stats={ladderStats(record, ladder)} isCurrent={isCurrent} />
        <StatTile bare className="px-3 py-2.5" label="K/D" value={formatKd(kd(o.kills, o.deaths))} sub={`${formatNumber(o.kills)} K · ${formatNumber(o.deaths)} D`} />
        <StatTile
          bare
          className="px-3 py-2.5"
          label="Win rate"
          value={formatRatio(winRate(o.wins, o.losses))}
          sub={`${formatNumber(o.wins)} W · ${formatNumber(o.losses)} L`}
        />
        <StatTile bare className="px-3 py-2.5" label="Headshots" value={formatRatio(o.headshotPct)} sub="Share of kills" />
      </div>
      <div className="flex flex-col">
        <SubHeading>Best operators (most rounds this season)</SubHeading>
        <div className="grid grid-cols-2 gap-3">
          <OperatorCell side="attack" stats={record.bestAttacker} />
          <OperatorCell side="defense" stats={record.bestDefender} />
        </div>
      </div>
      <PlaylistTable rows={record.byPlaylist} />
    </div>
  );
}

/**
 * Current season: Ranked rank and RP, K/D, win rate and headshot share (computed from the counts), the most-played
 * attacker and defender (design question 15) and one line per playlist, top three first. The card reads the
 * profile, whose failure the header reports (with Retry): here it is only a quiet note, not a second alert.
 */
export function CurrentSeasonCard({ profile }: { profile: StatsResult<'getProfile'> }) {
  const game = useGame();
  const ladder = ladderPlaylist(game);
  const record = profile.data?.data.currentSeason;
  const season = record ? game.season(record.seasonId) : null;
  const matches = record?.overall.matches ?? 0;
  if (profile.data === undefined && profile.status === 'error' && !profile.isFetching) {
    return (
      <SectionCard title="Current season">
        <ProfileFailedNote />
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Current season"
      subtitle={
        record
          ? `${season?.name ?? record.seasonId} · ${formatNumber(matches)} ${matches === 1 ? 'match' : 'matches'} · ${POOL_LABEL[record.platformFamily]} pool`
          : undefined
      }
      query={profile}
      skeleton={<CurrentSeasonSkeleton />}
      loadingLabel="Loading the current season"
      isEmpty={(fetched) => fetched.data.currentSeason.overall.matches === 0}
      empty={{
        title: 'No matches this season yet',
        description: `Nothing played in ${season?.name ?? 'the current season'} so far. Earlier seasons are under Seasons.`,
      }}
    >
      {(fetched) => <CurrentSeasonBody record={fetched.data.currentSeason} ladder={ladder} />}
    </SectionCard>
  );
}
