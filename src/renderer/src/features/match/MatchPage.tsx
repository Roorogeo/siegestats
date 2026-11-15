import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router';
import type { MatchId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import { useGame } from '../../app/GameConfigProvider';
import { parseMatchParams, parsePov } from '../../app/routes';
import { useMatch } from '../../queries';
import { Card, QueryError, QueryState, type QueryLike } from '../../ui';
import { BackLink, MatchHeader } from './MatchHeader';
import { MatchNotFound } from './MatchNotFound';
import { buildMatchView, type MatchView } from './match-view';
import { OperatorPicks } from './OperatorPicks';
import { RoundTimeline } from './RoundTimeline';
import { Scoreboard } from './Scoreboard';

const PAGE = 'mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-6 py-5';

function MatchDetails({ id, pov }: { id: MatchId; pov: PlayerKey | null }) {
  const game = useGame();
  const query = useMatch(id);
  const fetched = query.data;
  const view = useMemo(() => (fetched ? buildMatchView(fetched.data, pov, game) : undefined), [fetched, pov, game]);
  const back = pov && <BackLink pov={pov} name={view?.povPlayer?.name ?? null} />;

  // With nothing to show, the page is the error: one state for the whole match, not one per card.
  if (!fetched && query.status === 'error' && !query.isFetching) {
    if (query.error.code === 'not_found') return <MatchNotFound pov={pov} />;
    return (
      <div className={PAGE}>
        {back}
        <h1 tabIndex={-1} className="sr-only outline-none">
          Match details
        </h1>
        <Card flush>
          <QueryError error={query.error} title="This match could not be loaded" onRetry={() => void query.refetch()} />
        </Card>
      </div>
    );
  }

  // Every card reads the same answer: skeletons while it loads, then its own part (or its own empty state). Errors and
  // the "could not refresh" / "saved copy" notices are shown once, above them.
  const sections: QueryLike<MatchView> = {
    data: view,
    error: null,
    status: view ? 'success' : 'pending',
    fetchStatus: query.fetchStatus,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
  const refreshing = query.isFetching && view !== undefined;
  return (
    <div className={PAGE}>
      {back}
      {/* With data on screen this renders only the notices (a failed refresh, a stale saved copy), once for the page. */}
      {fetched && <QueryState query={query}>{() => null}</QueryState>}
      <MatchHeader view={view} />
      <Scoreboard query={sections} index={0} pov={pov} busy={refreshing} />
      <Scoreboard query={sections} index={1} pov={pov} busy={refreshing} />
      <RoundTimeline query={sections} />
      <OperatorPicks query={sections} />
    </div>
  );
}

/**
 * Route /match/:id?pov=platform:id (build links with matchPath()): one match. Both scoreboards, the round-by-round
 * timeline and the operator picks per round. `pov` is the player it was opened from: their team is listed first and
 * named "Your team", their row is marked, and a link leads back to their profile.
 */
export function MatchPage() {
  const id = parseMatchParams(useParams());
  const pov = parsePov(useLocation().search);
  if (!id) return <MatchNotFound pov={pov} invalid />;
  return <MatchDetails key={id} id={id} pov={pov} />;
}
