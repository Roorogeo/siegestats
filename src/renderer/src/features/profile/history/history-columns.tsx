import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { GameIndex } from '@shared/game-config';
import type { MatchResult, MatchSummary } from '@shared/types/match';
import type { PlayerKey } from '@shared/types/player';
import { kd } from '@shared/util/stats';
import { matchPath } from '../../../app/routes';
import { MapBadge, RankBadge } from '../../../components';
import { cn } from '../../../lib/cn';
import { DASH, formatDateTime, formatKd, formatNumber, formatRatio, timeAgo } from '../../../lib/format';
import { Badge, Delta, type Column } from '../../../ui';

const RESULT_LABEL: Readonly<Record<MatchResult, string>> = { win: 'Win', loss: 'Loss', draw: 'Draw' };
const RESULT_TONE: Readonly<Record<MatchResult, string>> = { win: 'text-positive', loss: 'text-negative', draw: 'text-text-muted' };

/** A playlist's name from the config, or a plain word for one the config does not know yet. */
export const playlistName = (game: GameIndex, match: Pick<MatchSummary, 'playlistId'>): string =>
  (match.playlistId === null ? null : game.playlist(match.playlistId)?.name) ?? 'Unknown playlist';

/** What the points of a match are called: RP on the Ranked ladder, plain points elsewhere (Legend Division). */
const pointsUnit = (game: GameIndex, match: MatchSummary): string =>
  match.playlistId !== null && game.playlist(match.playlistId)?.points === 'plain' ? 'points' : 'RP';

/** "Win 4-2 on Bank, 2 h ago": names a match in a link's accessible name. */
export const matchLabel = (game: GameIndex, match: MatchSummary, now: number): string =>
  `${RESULT_LABEL[match.result]} ${match.score.own}-${match.score.opponent}, ${playlistName(game, match)} on ${
    (match.mapId === null ? null : game.map(match.mapId)?.name) ?? 'an unknown map'
  }, ${timeAgo(match.startedAt, now)}`;

const LINK = 'inline-flex h-6 items-center gap-0.5 rounded-control pr-1 pl-2 text-xs font-medium transition-colors';

function ViewMatch({ match, player, label }: { match: MatchSummary; player: PlayerKey; label: string }) {
  if (!match.hasDetail) {
    return (
      <button
        type="button"
        disabled
        title="The data source has no details for this match"
        aria-label={`View match: ${label}. No details from this source`}
        className={cn(LINK, 'text-text-muted opacity-60')}
      >
        View match
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
    );
  }
  return (
    <Link to={matchPath(match.id, player)} aria-label={`View match: ${label}`} className={cn(LINK, 'text-text hover:bg-surface-2')}>
      View match
      <ChevronRight className="size-3.5 text-text-muted" aria-hidden />
    </Link>
  );
}

/**
 * One column per field of the brief's match row: mode, map, time ago, result and score, points after and their
 * change, K/D, K/D/A, HS%, and "View match" (opened from this player's point of view). The provider pages the rows
 * newest first, so nothing here re-sorts them: sorting only the loaded part of a history would mislead.
 */
export function historyColumns(game: GameIndex, player: PlayerKey, now: number): Column<MatchSummary>[] {
  return [
    {
      id: 'mode',
      header: 'Mode',
      cell: (m) => (
        <span className="flex items-center gap-1.5">
          <span className="text-text">{playlistName(game, m)}</span>
          {m.origin === 'live' && (
            <span title="Recorded on this PC by Live Match">
              <Badge className="h-[18px] px-1.5 text-[10px]">Recorded</Badge>
            </span>
          )}
        </span>
      ),
    },
    { id: 'map', header: 'Map', cell: (m) => <MapBadge mapId={m.mapId} size="sm" withName /> },
    {
      id: 'when',
      header: 'When',
      cell: (m) => (
        <time dateTime={m.startedAt} title={formatDateTime(m.startedAt)} className="text-text-muted">
          {timeAgo(m.startedAt, now)}
        </time>
      ),
    },
    {
      id: 'result',
      header: 'Result',
      cell: (m) => (
        <span className="tabular">
          <span className={cn('font-medium', RESULT_TONE[m.result])}>{RESULT_LABEL[m.result]}</span>{' '}
          <span className="text-text">
            {m.score.own}-{m.score.opponent}
          </span>
        </span>
      ),
    },
    {
      id: 'points',
      header: 'Points after',
      cell: (m) => {
        const after = m.rankChange?.after ?? null;
        if (!after) return <span className="text-text-muted">{DASH}</span>;
        const unit = pointsUnit(game, m);
        // Points without a division (Legend Division, Ranked placements) line up with the others, with no badge.
        return (
          <span className="inline-flex items-center gap-1.5">
            {after.rankId !== null ? <RankBadge rank={after} size="sm" unit={unit} /> : <span aria-hidden className="inline-block w-7" />}
            <span className="text-text tabular" {...(after.rankId === null ? { title: 'No division' } : { 'aria-hidden': true })}>
              {formatNumber(after.points)}
              {after.rankId === null && <span className="sr-only"> {unit}, no division</span>}
            </span>
          </span>
        );
      },
    },
    {
      id: 'change',
      header: 'Change',
      numeric: true,
      cell: (m) => <Delta value={m.rankChange?.delta ?? null} unit={pointsUnit(game, m)} />,
    },
    { id: 'kd', header: 'K/D', numeric: true, cell: (m) => formatKd(kd(m.kills, m.deaths)) },
    {
      id: 'kda',
      header: <abbr title="Kills / deaths / assists" className="no-underline">K/D/A</abbr>,
      numeric: true,
      cell: (m) => `${m.kills}/${m.deaths}/${m.assists ?? DASH}`,
    },
    { id: 'hs', header: <abbr title="Headshot percentage" className="no-underline">HS%</abbr>, numeric: true, cell: (m) => formatRatio(m.headshotPct) },
    {
      id: 'view',
      header: <span className="sr-only">Match details</span>,
      headerLabel: 'Match details',
      align: 'right',
      cell: (m) => <ViewMatch match={m} player={player} label={matchLabel(game, m, now)} />,
    },
  ];
}
