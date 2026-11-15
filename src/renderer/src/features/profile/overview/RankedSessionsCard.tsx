import { Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { PlayerKey } from '@shared/types/player';
import { useCurrentSeason, useGame } from '../../../app/GameConfigProvider';
import { matchPath } from '../../../app/routes';
import { PointsLineChart, pointsSeries, type PointsDatum } from '../../../charts';
import { formatNumber } from '../../../lib/format';
import { matchHistoryItems, useCapabilities, useMatches, type MatchHistoryFilter } from '../../../queries';
import { Button, EmptyState, SectionCard, Skeleton } from '../../../ui';
import { ChartDialog } from './ChartDialog';
import { ladderPlaylist } from './ladder';
import { ProfileFailedNote } from './ProfileFailedNote';

const TITLE = 'Ranked sessions';
const CHART_LABEL = 'Ranked points after every match';
const CHART_HEIGHT = 240;
/** The provider's page size cap; a ranked season is well under it, and further pages load on their own. */
const PAGE_SIZE = 100;

interface RankedSessionsCardProps {
  player: PlayerKey;
  /** The profile failed to load (with no copy): the header reports it, so a failure here too is only a quiet note. */
  profileFailed: boolean;
}

/**
 * Ranked sessions: RP after every Ranked match of the season in force (useCurrentSeason(), the provider's rule
 * too), oldest first, on a y-axis labelled with the season's rank divisions, a faint divider between sessions
 * (design question 16). A point opens its match. Expand shows the same chart at full size in a dialog. The season
 * comes from the config and the clock, so the matches load alongside the profile rather than after it.
 */
export function RankedSessionsCard({ player, profileFailed }: RankedSessionsCardProps) {
  const game = useGame();
  const seasonId = useCurrentSeason().id;
  const navigate = useNavigate();
  const ladder = ladderPlaylist(game);
  const capabilities = useCapabilities().data;
  /** The Expand button, set when it opens the dialog: focus goes back to it on close. */
  const opener = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  const filter: MatchHistoryFilter | null = ladder
    ? { player, playlistIds: [ladder.id], mapId: 'all', period: { kind: 'season', seasonId }, limit: PAGE_SIZE }
    : null;
  const matches = useMatches(filter);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = matches;

  // The whole season goes into the chart: load every page (one, for any real ranked season). A page that fails is
  // not retried in a loop: the chart shows what arrived, under QueryState's "could not refresh" notice with Retry.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const series = useMemo(() => pointsSeries(matchHistoryItems(matches.data)), [matches.data]);
  const ranks = game.rankSystemFor(seasonId)?.ranks ?? null;
  const season = game.season(seasonId);
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

  // The source failed for the profile and for this too: one error on the page is enough (the header's).
  if (profileFailed && matches.data === undefined && matches.status === 'error' && !matches.isFetching) {
    return (
      <SectionCard title={TITLE} subtitle="RP after every Ranked match">
        <ProfileFailedNote />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={TITLE}
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
      idle={<EmptyState className="py-6" title="Not available" description="The game data names no Ranked ladder playlist." />}
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
