import { useState } from 'react';
import type { PlayerKey } from '@shared/types/player';
import type { SeasonId } from '@shared/types/primitives';
import type { SeasonRecord } from '@shared/types/stats';
import { useCurrentSeason, useGame } from '../../../app/GameConfigProvider';
import { RankBadge } from '../../../components';
import { useSeasons } from '../../../queries';
import { SectionCard, SegmentedControl, ShowMore, Skeleton } from '../../../ui';
import { ladderPlaylist, ladderRankText, ladderStats } from './ladder';

type Shown = 'peak' | 'final';

/** Seasons listed before "Show more". */
const SEASONS_SHOWN = 5;

function PeakSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-1">
      {Array.from({ length: SEASONS_SHOWN }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-32" />
        </div>
      ))}
    </div>
  );
}

function SeasonRow({ record, shown, currentSeasonId }: { record: SeasonRecord; shown: Shown; currentSeasonId: SeasonId }) {
  const game = useGame();
  const ladder = ladderPlaylist(game);
  const season = game.season(record.seasonId);
  const stats = ladderStats(record, ladder);
  const rank = shown === 'peak' ? (stats?.standing?.peak ?? null) : (stats?.standing?.rank ?? null);
  const isCurrent = record.seasonId === currentSeasonId;
  // A season on another ladder (Ranked 2.0 vs 3.0) has its own divisions: the badge reads them from the config.
  const system = game.rankSystemFor(record.seasonId);
  const currentSystem = game.rankSystemFor(currentSeasonId);
  const otherLadder = system !== null && currentSystem !== null && system.id !== currentSystem.id;
  const placements = rank === null ? ladderRankText(stats, isCurrent) : null;
  return (
    <div className="flex min-h-11 items-center gap-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] text-text">{season?.name ?? record.seasonId}</span>
        <span className="truncate text-xs text-text-muted">
          {[record.seasonId, isCurrent ? 'Current season' : null, otherLadder ? system.name : null].filter((part) => part !== null).join(' · ')}
        </span>
      </div>
      {placements !== null ? (
        // Ranked matches but no rank: placements not finished (yet, for the current season).
        <span className="flex w-48 shrink-0 items-center gap-1.5">
          <span aria-hidden className="flex">
            <RankBadge rank={null} />
          </span>
          <span className="truncate text-[13px] text-text">{placements}</span>
        </span>
      ) : (
        <RankBadge rank={rank} withName className="w-48 shrink-0" />
      )}
    </div>
  );
}

/**
 * Peak ranks: one row per season played, newest first, with a toggle between the highest Ranked standing reached in
 * the season and where it ended (for the current season: where it stands now).
 */
export function PeakRanksCard({ player }: { player: PlayerKey }) {
  const seasons = useSeasons(player);
  const currentSeasonId = useCurrentSeason().id;
  const [shown, setShown] = useState<Shown>('peak');
  return (
    <SectionCard
      title="Peak ranks"
      subtitle={shown === 'peak' ? 'Highest Ranked rank reached each season' : 'Ranked rank each season ended on'}
      actions={
        <SegmentedControl
          label="Rank shown"
          size="sm"
          value={shown}
          onChange={setShown}
          options={[
            { id: 'peak', label: 'Highest' },
            { id: 'final', label: 'Final' },
          ]}
        />
      }
      query={seasons}
      skeleton={<PeakSkeleton />}
      loadingLabel="Loading seasons"
      isEmpty={(fetched) => fetched.data.length === 0}
      empty={{ title: 'No seasons played yet', description: 'Seasons show here once this account has played a match.' }}
    >
      {(fetched) => (
        <ShowMore
          items={fetched.data}
          initial={SEASONS_SHOWN}
          noun="seasons"
          label="Seasons"
          itemKey={(record) => record.seasonId}
          listClassName="divide-y divide-border"
        >
          {(record) => <SeasonRow record={record} shown={shown} currentSeasonId={currentSeasonId} />}
        </ShowMore>
      )}
    </SectionCard>
  );
}
