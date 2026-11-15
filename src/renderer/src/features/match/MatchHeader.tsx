import { ArrowLeft, HardDrive } from 'lucide-react';
import { Link } from 'react-router';
import type { PlayerKey } from '@shared/types/player';
import { useGame } from '../../app/GameConfigProvider';
import { playerPath } from '../../app/routes';
import { MapBadge } from '../../components';
import { cn } from '../../lib/cn';
import { formatDate, formatDateTime, formatDuration, timeAgo } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { Badge, Loading, LoadingHeading, Skeleton } from '../../ui';
import { RESULT_WORD, scoreText, TEAM_NAME, type MatchView } from './match-view';
import { TeamSwatch } from './team-colors';

const RESULT_TONE = { win: 'text-positive', loss: 'text-negative', draw: 'text-text-muted' } as const;

const Dot = () => (
  <span aria-hidden className="text-text-muted">
    ·
  </span>
);

/** "Back to <name>": the profile the match was opened from. */
export function BackLink({ pov, name }: { pov: PlayerKey; name: string | null }) {
  return (
    <Link
      to={playerPath(pov)}
      className="inline-flex h-6 items-center gap-1 self-start rounded-control text-xs text-text-muted transition-colors hover:text-text"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {name ? `Back to ${name}` : 'Back to the profile'}
    </Link>
  );
}

function HeaderSkeleton() {
  return (
    <Loading label="Loading match">
      <div className="flex items-center gap-4 rounded-card border border-border bg-surface px-5 py-4">
        <Skeleton className="h-8 w-12" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-96" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-32" />
        </div>
      </div>
    </Loading>
  );
}

/** The final score: from the point-of-view team ("Victory 4-2"), or blue against orange when nobody's view is known. */
function FinalScore({ view }: { view: MatchView }) {
  const [first, second] = view.teams;
  const { score: own, result } = first.team;
  const opponent = second.team.score;
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
      <span className="text-xs text-text-muted">Final score</span>
      {view.povKnown ? (
        <p className="text-lg leading-7 font-semibold" data-testid="match-result">
          <span className={RESULT_TONE[result]}>{RESULT_WORD[result]}</span> <span className="text-text tabular">{scoreText(own, opponent)}</span>
        </p>
      ) : (
        <p className="flex items-center gap-2 text-lg leading-7 font-semibold text-text" data-testid="match-result">
          <TeamSwatch team={first.id} />
          {/* Spaces as text, not only gaps, so the line also reads "Blue 4-2 Orange" to a screen reader. */}
          <span>{first.label}</span> <span className="tabular">{scoreText(own, opponent)}</span> <span>{second.label}</span>
          <TeamSwatch team={second.id} />
        </p>
      )}
      <span className="flex items-center gap-1.5 text-xs text-text-muted">
        {view.povKnown ? (
          <>
            <TeamSwatch team={first.id} className="size-2" />
            {`Your team played as ${TEAM_NAME[first.id]}`}
          </>
        ) : result === 'draw' ? (
          'Draw'
        ) : (
          `${result === 'win' ? first.label : second.label} won`
        )}
      </span>
    </div>
  );
}

/**
 * Playlist and map (the page's h1), season, start time and how long ago, duration, and the final score with the
 * point-of-view team's result in words and colour. A match recorded by Live Match says so.
 */
export function MatchHeader({ view }: { view: MatchView | undefined }) {
  const game = useGame();
  const now = useNow();
  if (!view) {
    return (
      <>
        <LoadingHeading>Match details</LoadingHeading>
        <HeaderSkeleton />
      </>
    );
  }
  const { match } = view;
  const playlist = match.playlistId === null ? null : game.playlist(match.playlistId);
  const map = match.mapId === null ? null : game.map(match.mapId);
  const season = game.season(match.seasonId);
  const ago = timeAgo(match.startedAt, now);
  return (
    <header data-testid="match-header" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-border bg-surface px-5 py-4">
      <div className="flex min-w-0 flex-1 basis-96 items-center gap-4">
        <MapBadge mapId={match.mapId} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 tabIndex={-1} className="min-w-0 truncate text-lg leading-7 font-semibold text-text outline-none">
              {playlist?.name ?? 'Unknown playlist'} on {map?.name ?? 'an unknown map'}
            </h1>
            {match.origin === 'live' && (
              <Badge>
                <HardDrive className="size-3" aria-hidden />
                Recorded on this PC
              </Badge>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span>{season?.name ?? match.seasonId}</span>
            <Dot />
            <time dateTime={match.startedAt} className="text-text tabular">
              {formatDateTime(match.startedAt)}
            </time>
            {/* From a week back "X ago" is the date again: no need to say it twice. */}
            {ago !== formatDate(match.startedAt) && (
              <>
                <Dot />
                <span>{ago}</span>
              </>
            )}
            <Dot />
            <span>
              Duration <span className={cn('tabular', match.durationSec !== null && 'text-text')}>{formatDuration(match.durationSec)}</span>
            </span>
          </p>
        </div>
      </div>
      <FinalScore view={view} />
    </header>
  );
}
