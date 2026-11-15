import { Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Encounter } from '@shared/types/match';
import type { PlayerKey } from '@shared/types/player';
import { ratio } from '@shared/util/stats';
import { matchPath, playerPath } from '../../../app/routes';
import { Avatar, PlatformLabel } from '../../../components';
import { formatDateTime, formatNumber, formatRatio, timeAgo } from '../../../lib/format';
import { useNow } from '../../../lib/useNow';
import { useEncounters } from '../../../queries';
import {
  DataTable, EmptyState, QueryState, SectionCard, ShowMoreButton, TextInput, useShowMore, type Column, type SortState,
} from '../../../ui';
import { CardTitle } from '../overview/CardTitle';
import { sortRows } from './sort-rows';

/** Rows shown before "Show N more". */
const INITIAL_ROWS = 25;
const DEFAULT_SORT: SortState = { columnId: 'matches', direction: 'desc' };

/** The owner's win rate in the shared matches. Encounter has no losses, so this is wins over matches. */
const winShare = (e: Encounter): number | null => ratio(e.wins, e.matches);

function encounterColumns(owner: PlayerKey, now: number): Column<Encounter>[] {
  return [
    {
      id: 'player',
      header: 'Player',
      cell: (e) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar player={e.player} size="sm" />
          <Link to={playerPath(e.player)} className="truncate text-text hover:underline">
            {e.player.name}
          </Link>
          <PlatformLabel platform={e.player.platform} variant="icon" />
        </span>
      ),
      sortValue: (e) => e.player.name.toLowerCase(),
      firstDirection: 'asc',
    },
    { id: 'matches', header: 'Matches', numeric: true, cell: (e) => formatNumber(e.matches), sortValue: (e) => e.matches },
    { id: 'teammate', header: 'As teammate', numeric: true, cell: (e) => formatNumber(e.asTeammate), sortValue: (e) => e.asTeammate },
    { id: 'opponent', header: 'As opponent', numeric: true, cell: (e) => formatNumber(e.asOpponent), sortValue: (e) => e.asOpponent },
    { id: 'wins', header: 'Wins', numeric: true, cell: (e) => formatNumber(e.wins), sortValue: (e) => e.wins },
    { id: 'wr', header: 'Win rate', numeric: true, cell: (e) => formatRatio(winShare(e)), sortValue: winShare },
    {
      id: 'last',
      header: 'Last met',
      align: 'right',
      cell: (e) => {
        const when = timeAgo(e.lastMetAt, now);
        return e.lastMatchId ? (
          <Link
            to={matchPath(e.lastMatchId, owner)}
            title={formatDateTime(e.lastMetAt)}
            aria-label={`Last match with ${e.player.name}, ${when}`}
            className="text-text-muted hover:text-text hover:underline"
          >
            {when}
          </Link>
        ) : (
          <span title={formatDateTime(e.lastMetAt)} className="text-text-muted">
            {when}
          </span>
        );
      },
      sortValue: (e) => Date.parse(e.lastMetAt),
    },
  ];
}

function EncounterTable({ owner, rows, filter }: { owner: PlayerKey; rows: readonly Encounter[]; filter: string }) {
  const now = useNow();
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const columns = useMemo(() => encounterColumns(owner, now), [owner, now]);
  const needle = filter.trim().toLowerCase();
  const matching = useMemo(() => (needle ? rows.filter((e) => e.player.name.toLowerCase().includes(needle)) : rows), [rows, needle]);
  // Sorted before "Show more" cuts the list, so the first rows are the top of the whole sorted list.
  const sorted = useMemo(() => sortRows(matching, columns, sort), [matching, columns, sort]);
  const more = useShowMore(sorted, INITIAL_ROWS);
  const tableId = useId();
  return (
    <>
      <div id={tableId} className="border-t border-border">
        <DataTable
          label="Encounters"
          columns={columns}
          rows={more.visible}
          rowKey={(e) => `${e.player.platform}:${e.player.id}`}
          sort={sort}
          onSortChange={setSort}
          manualSort
          empty={<EmptyState title={`No player name contains “${filter.trim()}”`} description="Clear the filter to see everyone." className="py-8" />}
        />
      </div>
      <div className="flex min-h-11 items-center gap-3 border-t border-border px-4 py-2">
        <p role="status" className="text-xs text-text-muted tabular">
          {needle
            ? `${formatNumber(matching.length)} of ${formatNumber(rows.length)} players`
            : `Showing ${formatNumber(more.visible.length)} of ${formatNumber(rows.length)} players`}
        </p>
        <ShowMoreButton state={more} controls={tableId} noun="players" className="ml-auto" />
      </div>
    </>
  );
}

/**
 * The Encounters tab: players this account shared two or more matches with, as teammate and as opponent, and the
 * account's wins in those matches. Sortable (most matches first), with a name filter.
 */
export function EncountersTab({ player }: { player: PlayerKey }) {
  const encounters = useEncounters(player);
  const [filter, setFilter] = useState('');
  return (
    <SectionCard
      title={<CardTitle>Encounters</CardTitle>}
      subtitle="Players met in two or more matches"
      flush
      actions={
        <TextInput
          type="search"
          aria-label="Filter players by name"
          placeholder="Filter by name"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          leading={<Search className="size-3.5 shrink-0" aria-hidden />}
          wrapperClassName="w-52"
        />
      }
    >
      <p className="px-4 pb-3 text-xs text-text-muted">
        Counts are of the matches this player shared with each one. Wins and win rate are this player&apos;s, in those
        matches.
      </p>
      <QueryState
        query={encounters}
        compact
        loadingLabel="Loading encounters"
        skeleton={
          <div className="border-t border-border">
            <DataTable label="Encounters" columns={encounterColumns(player, 0)} rows={undefined} rowKey={(e) => e.player.id} skeletonRows={8} />
          </div>
        }
        isEmpty={(data) => data.data.length === 0}
        empty={{ title: 'No encounters yet', description: 'Players met in two or more matches show here.' }}
      >
        {(data) => <EncounterTable owner={player} rows={data.data} filter={filter} />}
      </QueryState>
    </SectionCard>
  );
}
