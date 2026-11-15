import { Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { PlayerKey } from '@shared/types/player';
import type { SeasonId } from '@shared/types/primitives';
import { useGame } from '../../../app/GameConfigProvider';
import { matchPath } from '../../../app/routes';
import { PointsLineChart, pointsSeries, type PointsDatum } from '../../../charts';
import { formatNumber } from '../../../lib/format';
import { matchHistoryItems, useCapabilities, useMatches, type MatchHistoryFilter } from '../../../queries';
import { Button, EmptyState, SectionCard, Skeleton } from '../../../ui';
import { CardTitle } from './CardTitle';
import { ChartDialog } from './ChartDialog';
import { ladderPlaylist } from './ladder';

const TITLE = 'Ranked sessions';
const CHART_LABEL = 'Ranked points after every match';
const CHART_HEIGHT = 240;
/** The provider's page size cap; a ranked season is well under it, and further pages load on their own. */
const PAGE_SIZE = 100;

/**
 * Ranked sessions: RP after every Ranked match of the current season, oldest first, on a y-axis labelled with the
 * season's rank divisions, a faint divider between sessions (design question 16). A point opens its match. Expand
 * shows the same chart at full size in a dialog.
 */
interface RankedSessionsCardProps {
  player: PlayerKey;
  /** The provider's current season for this player (from the profile); null until the profile has loaded. */
  seasonId: SeasonId | null;
  /** The profile failed to load, so the season is not coming. */
  profileFailed: boolean;
}

export function RankedSessionsCard({ player, seasonId, profileFailed }: RankedSessionsCardProps) {
  const game = useGame();
  const navigate = useNavigate();
  const ladder = ladderPlaylist(game);
  const capabilities = useCapabilities().data;
  /** The Expand button, set when it opens the dialog: focus goes back to it on close. */
  const opener = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  const filter: MatchHistoryFilter | null =
    ladder && seasonId ? { player, playlistIds: [ladder.id], mapId: 'all', period: { kind: 'season', seasonId }, limit: PAGE_SIZE } : null;
  const matches = useMatches(filter);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = matches;

  // The whole season goes into the chart: load every page (one, for any real ranked season). A page that fails is
  // not retried in a loop: the chart shows what arrived, under QueryState's "could not refresh" notice with Retry.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const series = useMemo(() => pointsSeries(matchHistoryItems(matches.data)), [matches.data]);
  const ranks = seasonId ? (game.rankSystemFor(seasonId)?.ranks ?? null) : null;
  const season = seasonId ? game.season(seasonId) : null;
  const complete = matches.data !== undefined && (!hasNextPage || isFetchNextPageError);
  const noPerMatchPoints = capabilities?.rankChangePerMatch === false;
  const latest = series.at(-1);

  const open = (datum: PointsDatum): void => {
    if (datum.matchId) void navigate(matchPath(datum.matchId, player));
  };
  const subtitle =
    season && complete
      ? `RP after every Ranked match · ${season.name} · ${formatNumber(series.length)} ${series.length === 1 ? 'match' : 'matches'}`
      : 'RP after every Ranked match';
  const skeleton = <Skeleton className="h-full w-full" />;

  return (
    <SectionCard
      title={<CardTitle>{TITLE}</CardTitle>}
      subtitle={subtitle}
      actions={
        complete && series.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Maximize2 className="size-3.5" aria-hidden />}
            aria-haspopup="dialog"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setExpanded(true);
            }}
          >
            Expand
          </Button>
        ) : undefined
      }
      query={matches}
      skeleton={<div style={{ height: CHART_HEIGHT }}>{skeleton}</div>}
      idle={
        ladder === null ? (
          <EmptyState className="py-6" title="Not available" description="The game data names no Ranked ladder playlist." />
        ) : profileFailed ? (
          <EmptyState className="py-6" title="Waiting for the profile" description="This chart needs the player's current season. Retry the profile above." />
        ) : (
          <div style={{ height: CHART_HEIGHT }}>{skeleton}</div>
        )
      }
      loadingLabel="Loading ranked matches"
      isEmpty={() => complete && series.length === 0}
      empty={
        noPerMatchPoints
          ? { title: 'Not available from this source', description: 'The stats source does not report RP per match.' }
          : { title: 'No ranked matches this season', description: `Points after each Ranked match of ${season?.name ?? 'this season'} show here.` }
      }
    >
      {() =>
        complete ? (
          <>
            <PointsLineChart label={CHART_LABEL} data={series} ranks={ranks} height={CHART_HEIGHT} onSelect={open} busy={matches.isFetching} />
            {expanded && (
              <ChartDialog
                title={TITLE}
                subtitle={`${subtitle}${latest ? ` · now ${formatNumber(latest.points)} RP` : ''}`}
                returnFocus={opener}
                onClose={() => setExpanded(false)}
              >
                {(height) => <PointsLineChart label={`${CHART_LABEL}, full size`} data={series} ranks={ranks} height={height} onSelect={open} />}
              </ChartDialog>
            )}
          </>
        ) : (
          <div style={{ height: CHART_HEIGHT }}>{skeleton}</div>
        )
      }
    </SectionCard>
  );
}
