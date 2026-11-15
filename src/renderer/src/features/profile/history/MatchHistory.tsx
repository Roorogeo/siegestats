import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { GameIndex } from '@shared/game-config';
import type { MatchHistorySummary, MatchSummary } from '@shared/types/match';
import type { MatchId, PlaylistId, SeasonId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import { DAY_MS, toMs } from '@shared/util/time';
import { useCurrentSeason, useGame } from '../../../app/GameConfigProvider';
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
  PERIOD_CHOICES, PERIOD_LABEL, periodDays, periodPhrase, readPeriod, readPlaylists, toMatchPeriod, writeHistoryParams,
  type PeriodChoice,
} from './history-params';
import { pointsUnit, type PointsUnit } from '../overview/ladder';
import { HistorySummary, HistorySummarySkeleton } from './HistorySummary';

/** Rows per page: the first page, and each "Load more". */
export const HISTORY_PAGE_SIZE = 20;

const PERIOD_OPTIONS = PERIOD_CHOICES.map((id) => ({ id, label: PERIOD_LABEL[id] }));

/** Matches per playlist in the period, whatever the chips select: the summary's periodPlaylists of the first page. */
const periodCounts = (summary: MatchHistorySummary | null): ReadonlyMap<PlaylistId, number> | null =>
  summary ? new Map(summary.periodPlaylists.map((p) => [p.playlistId, p.matches])) : null;

/**
 * The season to name beside the points change: the provider counts it only inside one season (the newest match's
 * with points), so a days period that reaches back past that season's start says which season it covers. The
 * "Season" period is that season already, so it needs no name.
 */
function pointsSeasonOf(game: GameIndex, summary: MatchHistorySummary, period: PeriodChoice, now: number): SeasonId | null {
  const days = periodDays(period);
  const seasonId = summary.pointsChangeSeasonId;
  if (days === null || seasonId === null) return null;
  const startsAt = game.season(seasonId)?.startsAt;
  return startsAt === undefined || now - days * DAY_MS < toMs(startsAt) ? seasonId : null;
}

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
function pointsUnitOf(game: GameIndex, counts: ReadonlyMap<PlaylistId, number> | null, selected: readonly PlaylistId[] | 'all'): PointsUnit {
  const ids = selected === 'all' ? game.config.playlists.map((p) => p.id) : selected;
  const played = ids.filter((id) => counts === null || (counts.get(id) ?? 0) > 0);
  const units = played.filter((id) => (game.playlist(id)?.points ?? null) !== null).map((id) => pointsUnit(game, id));
  return units.length > 0 && units.every((unit) => unit === 'points') ? 'points' : 'RP';
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
  pointsUnit: PointsUnit;
  /** The season the points change covers, when the period also reaches into earlier ones. */
  pointsSeasonId: SeasonId | null;
  busy: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  nextPageError: string | null;
  onLoadMore(): void;
}

function HistoryBody({ pages, columns, pointsUnit, pointsSeasonId, busy, hasNextPage, isFetchingNextPage, nextPageError, onLoadMore }: HistoryBodyProps) {
  const rows = matchHistoryItems(pages);
  const summary = matchHistorySummary(pages);
  const total = summary?.matches ?? rows.length;
  const next = Math.min(HISTORY_PAGE_SIZE, Math.max(0, total - rows.length));
  const tableRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  /** Set when "Load more" is pressed while it has focus: where the new rows will start, and the newest row then. */
  const focusNew = useRef<{ index: number; firstId: MatchId | undefined } | null>(null);
  const count = rows.length;
  const firstId = rows[0]?.id;

  // The new rows push the button down, and the last page takes it away: keyboard focus moves to the first new
  // row's "View match" (or, with no link there, the row count), so keyboard users keep their place.
  useEffect(() => {
    const wanted = focusNew.current;
    if (!wanted || count <= wanted.index) return;
    focusNew.current = null;
    if (firstId !== wanted.firstId) return; // other rows came in meanwhile (another filter)
    const active = document.activeElement;
    const kept = active === null || active === document.body || (footerRef.current?.contains(active) ?? false);
    if (!kept) return; // focus went somewhere else meanwhile
    const added = [...(tableRef.current?.querySelectorAll('tbody tr') ?? [])].slice(wanted.index);
    const link = added.map((row) => row.querySelector<HTMLElement>('a[href]')).find((a) => a !== null);
    (link ?? statusRef.current)?.focus();
  }, [count, firstId]);

  const pending = isFetchingNextPage || busy;
  return (
    <>
      {summary && <HistorySummary summary={summary} pointsUnit={pointsUnit} pointsSeasonId={pointsSeasonId} busy={busy} className="px-4 pb-3" />}
      <div ref={tableRef} className="border-t border-border">
        <DataTable label="Match history" columns={columns} rows={rows} rowKey={(m) => m.id} busy={busy} />
      </div>
      <div ref={footerRef} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2">
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
            onClick={(event) => {
              if (pending) return;
              focusNew.current = event.currentTarget === document.activeElement ? { index: rows.length, firstId } : null;
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
  const currentSeasonId = useCurrentSeason().id;
  const [params, setParams] = useSearchParams();
  const period = readPeriod(params);
  const playlists = readPlaylists(params, game);
  const matchPeriod = useMemo(() => toMatchPeriod(period, currentSeasonId), [period, currentSeasonId]);

  const setFilters = (next: { period?: PeriodChoice; playlists?: PlaylistId[] | 'all' }): void =>
    setParams((prev) => writeHistoryParams(prev, next), { preventScrollReset: true });

  const filter: MatchHistoryFilter = { player, playlistIds: playlists, mapId: 'all', period: matchPeriod, limit: HISTORY_PAGE_SIZE };
  const history = useMatches(filter, { keepPrevious: true });
  const summary = matchHistorySummary(history.data);
  // The chips come with the first page. While another period loads they show the previous one's, dimmed like the rows.
  const counts = periodCounts(summary);
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
      title="Match history"
      subtitle="Newest first"
      flush
      actions={<SegmentedControl label="Period" size="sm" options={PERIOD_OPTIONS} value={period} onChange={(id) => setFilters({ period: id })} />}
    >
      <div className="@container flex flex-col">
        <div className="px-4 pb-3">
          {counts === null && !history.isError ? (
            <ChipsSkeleton />
          ) : (
            <ChipGroup
              label="Playlists"
              options={options}
              value={playlists}
              onChange={(value) => setFilters({ playlists: value })}
              className={cn(history.isPlaceholderData && 'opacity-60 transition-opacity')}
            />
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
              pointsSeasonId={summary ? pointsSeasonOf(game, summary, period, now) : null}
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
