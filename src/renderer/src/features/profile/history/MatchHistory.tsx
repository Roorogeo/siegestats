import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { GameIndex } from '@shared/game-config';
import type { MatchSummary } from '@shared/types/match';
import type { PlaylistId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import { useGame } from '../../../app/GameConfigProvider';
import { cn } from '../../../lib/cn';
import { formatNumber } from '../../../lib/format';
import { useNow } from '../../../lib/useNow';
import { matchHistoryItems, matchHistorySummary, useMatches, type MatchHistoryFilter, type MatchPages } from '../../../queries';
import {
  Button, ChipGroup, DataTable, QueryState, SectionCard, SegmentedControl, Skeleton, type ChipOption, type Column,
  type QueryLike,
} from '../../../ui';
import { historyColumns } from './history-columns';
import {
  PERIOD_CHOICES, PERIOD_LABEL, periodPhrase, readPeriod, readPlaylists, toMatchPeriod, writeHistoryParams,
  type PeriodChoice,
} from './history-params';
import { CardTitle } from '../overview/CardTitle';
import { HistorySummary, HistorySummarySkeleton } from './HistorySummary';
import { usePeriodPlaylists } from './usePeriodPlaylists';

/** Rows per page: the first page, and each "Load more". */
export const HISTORY_PAGE_SIZE = 20;

const PERIOD_OPTIONS = PERIOD_CHOICES.map((id) => ({ id, label: PERIOD_LABEL[id] }));

/** The chips: only playlists the player has in the period (with their match counts), plus any chip that is on. */
function chipOptions(game: GameIndex, counts: ReadonlyMap<PlaylistId, number> | null, selected: readonly PlaylistId[] | 'all'): ChipOption<PlaylistId>[] {
  const on = new Set<PlaylistId>(selected === 'all' ? [] : selected);
  return game.config.playlists
    .filter((p) => on.has(p.id) || (counts?.get(p.id) ?? 0) > 0)
    .map((p) => ({ id: p.id, label: p.name, ...(counts ? { count: counts.get(p.id) ?? 0 } : {}) }));
}

/**
 * What the summary's points change is counted in. The provider sums the Ranked ladder when the filtered matches
 * have any, otherwise a plain-points playlist (Legend Division); it never adds the two.
 */
function pointsUnitOf(game: GameIndex, counts: ReadonlyMap<PlaylistId, number> | null, selected: readonly PlaylistId[] | 'all'): 'RP' | 'points' {
  const ids = selected === 'all' ? game.config.playlists.map((p) => p.id) : selected;
  const played = ids.filter((id) => counts === null || (counts.get(id) ?? 0) > 0);
  const kinds = new Set(played.map((id) => game.playlist(id)?.points ?? null));
  return !kinds.has('ladder') && kinds.has('plain') ? 'points' : 'RP';
}

function ChipsSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-1.5">
      {['w-12', 'w-20', 'w-24', 'w-28'].map((width) => (
        <Skeleton key={width} className={`h-7 rounded-full ${width}`} />
      ))}
    </div>
  );
}

function HistorySkeleton({ columns }: { columns: readonly Column<MatchSummary>[] }) {
  return (
    <>
      <HistorySummarySkeleton className="px-4 pb-3" />
      <div className="border-t border-border">
        <DataTable label="Match history" columns={columns} rows={undefined} rowKey={(m) => m.id} skeletonRows={8} />
      </div>
    </>
  );
}

interface HistoryBodyProps {
  pages: MatchPages;
  columns: readonly Column<MatchSummary>[];
  pointsUnit: 'RP' | 'points';
  busy: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  nextPageError: string | null;
  onLoadMore(): void;
}

function HistoryBody({ pages, columns, pointsUnit, busy, hasNextPage, isFetchingNextPage, nextPageError, onLoadMore }: HistoryBodyProps) {
  const rows = matchHistoryItems(pages);
  const summary = matchHistorySummary(pages);
  const total = summary?.matches ?? rows.length;
  const next = Math.min(HISTORY_PAGE_SIZE, Math.max(0, total - rows.length));
  const statusRef = useRef<HTMLParagraphElement>(null);
  const loadClicked = useRef(false);

  // The button goes away with the last page: keep keyboard focus nearby, on the row count, instead of losing it.
  useEffect(() => {
    if (!hasNextPage && loadClicked.current) {
      loadClicked.current = false;
      statusRef.current?.focus();
    }
  }, [hasNextPage]);

  const pending = isFetchingNextPage || busy;
  return (
    <>
      {summary && <HistorySummary summary={summary} pointsUnit={pointsUnit} busy={busy} className="px-4 pb-3" />}
      <div className="border-t border-border">
        <DataTable label="Match history" columns={columns} rows={rows} rowKey={(m) => m.id} busy={busy} />
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2">
        <p ref={statusRef} tabIndex={-1} role="status" className="rounded-control text-xs text-text-muted tabular">
          Showing {formatNumber(rows.length)} of {formatNumber(total)} {total === 1 ? 'match' : 'matches'}
        </p>
        {nextPageError !== null && (
          <p role="alert" className="flex min-w-0 items-center gap-1.5 text-xs text-text">
            <TriangleAlert className="size-3.5 shrink-0 text-negative" aria-hidden />
            <span className="truncate">Could not load more: {nextPageError}</span>
          </p>
        )}
        {hasNextPage && (
          // Not disabled while loading: a disabled button would drop the keyboard focus.
          <Button
            size="sm"
            className={cn('ml-auto', pending && 'opacity-60')}
            aria-disabled={pending || undefined}
            aria-busy={isFetchingNextPage || undefined}
            onClick={() => {
              if (pending) return;
              loadClicked.current = true;
              onLoadMore();
            }}
          >
            {isFetchingNextPage ? 'Loading…' : nextPageError !== null ? 'Retry' : next > 0 ? `Load ${next} more` : 'Load more'}
          </Button>
        )}
      </div>
    </>
  );
}

/**
 * The profile's match history (brief, screen 2): playlist chips, a 7 / 30 / 90 days / season picker, the summary
 * row for the whole filtered period, then one row per match with "View match", 20 at a time with "Load more".
 * The filters live in the URL (hp, hperiod), so back and forward restore them.
 */
export function MatchHistory({ player }: { player: PlayerKey }) {
  const game = useGame();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const period = readPeriod(params);
  const playlists = readPlaylists(params, game);
  const matchPeriod = useMemo(() => toMatchPeriod(period, game), [period, game]);

  const setFilters = (next: { period?: PeriodChoice; playlists?: PlaylistId[] | 'all' }): void =>
    setParams((prev) => writeHistoryParams(prev, next), { preventScrollReset: true });

  const filter: MatchHistoryFilter = { player, playlistIds: playlists, mapId: 'all', period: matchPeriod, limit: HISTORY_PAGE_SIZE };
  const history = useMatches(filter, { keepPrevious: true });
  const { counts, failed } = usePeriodPlaylists(player, matchPeriod);
  const columns = useMemo(() => historyColumns(game, player, now), [game, player, now]);

  const options = chipOptions(game, counts, playlists);
  const chosen = playlists === 'all' ? '' : `${playlists.map((id) => game.playlist(id)?.name ?? id).join(' or ')} `;
  const nextPageError = history.isFetchNextPageError && history.error ? history.error.message : null;

  // A failed "Load more" is reported beside its button; QueryState would otherwise call it a failed refresh.
  const state: QueryLike<MatchPages> = {
    data: history.data,
    error: history.isFetchNextPageError ? null : history.error,
    status: history.isFetchNextPageError ? 'success' : history.status,
    fetchStatus: history.fetchStatus,
    isFetching: history.isFetching,
    refetch: history.refetch,
  };

  return (
    <SectionCard
      title={<CardTitle>Match history</CardTitle>}
      subtitle="Newest first"
      flush
      actions={<SegmentedControl label="Period" size="sm" options={PERIOD_OPTIONS} value={period} onChange={(id) => setFilters({ period: id })} />}
    >
      <div className="@container flex flex-col">
        <div className="px-4 pb-3">
          {counts === null && !failed ? (
            <ChipsSkeleton />
          ) : (
            <ChipGroup label="Playlists" options={options} value={playlists} onChange={(value) => setFilters({ playlists: value })} />
          )}
        </div>
        <QueryState
          query={state}
          compact
          loadingLabel="Loading match history"
          skeleton={<HistorySkeleton columns={columns} />}
          isEmpty={(pages) => matchHistoryItems(pages).length === 0}
          empty={{
            title: `No ${chosen}matches ${periodPhrase(period)}`,
            description: period === '7' || period === '30' ? 'Try a longer period or another playlist.' : 'Try another period or playlist.',
          }}
        >
          {(pages) => (
            <HistoryBody
              pages={pages}
              columns={columns}
              pointsUnit={pointsUnitOf(game, counts, playlists)}
              busy={history.isPlaceholderData}
              hasNextPage={history.hasNextPage && !history.isPlaceholderData}
              isFetchingNextPage={history.isFetchingNextPage}
              nextPageError={nextPageError}
              onLoadMore={() => void history.fetchNextPage()}
            />
          )}
        </QueryState>
      </div>
    </SectionCard>
  );
}
