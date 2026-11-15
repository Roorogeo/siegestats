import { Link } from 'react-router';
import type { GameIndex } from '@shared/game-config';
import type { MatchPlayer, MatchTeam } from '@shared/types/match';
import type { OperatorId, PlayerId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import { kd } from '@shared/util/stats';
import { useGame } from '../../app/GameConfigProvider';
import { playerPath } from '../../app/routes';
import { Avatar, OperatorBadge } from '../../components';
import { DASH, formatKd, formatNumber, formatRatio } from '../../lib/format';
import { DataTable, SectionCard, type Column, type QueryLike } from '../../ui';
import { RESULT_VERB, scoreText, TEAM_NAME, type MatchView, type TeamTotals } from './match-view';
import { TeamSwatch } from './team-colors';

type ScoreRow = { kind: 'player'; player: MatchPlayer } | { kind: 'total'; totals: TeamTotals };

/** Operators shown in a row; the rest are summed up as "+N" (a 9-round match can see 9 different picks). */
const MAX_OPERATORS = 5;

/** The totals row answers null to every sort, and DataTable keeps nulls last in both directions: it stays at the bottom. */
const playerValue = <T,>(row: ScoreRow, get: (player: MatchPlayer) => T): T | null => (row.kind === 'player' ? get(row.player) : null);

function PlayerCell({ player, remoteAvatar }: { player: MatchPlayer; remoteAvatar: boolean }) {
  const ref = player.player;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar player={{ id: (ref?.id ?? player.name) as PlayerId, name: player.name, avatarUrl: ref?.avatarUrl ?? null }} size="sm" remote={remoteAvatar} />
      {ref ? (
        <Link to={playerPath(ref)} className="selectable min-w-0 truncate rounded-[3px] text-text hover:underline">
          {player.name}
        </Link>
      ) : (
        <span className="selectable min-w-0 truncate text-text">{player.name}</span>
      )}
    </span>
  );
}

const operatorName = (game: GameIndex, id: OperatorId | undefined): string | null =>
  id === undefined ? null : (game.operator(id)?.name ?? 'Unknown operator');

function OperatorsCell({ ids }: { ids: MatchPlayer['operatorIds'] }) {
  const game = useGame();
  if (ids.length === 0) return <span className="text-text-muted">{DASH}</span>;
  const rest = ids.slice(MAX_OPERATORS).map((id) => operatorName(game, id) ?? '');
  return (
    <span className="flex items-center gap-1">
      {ids.slice(0, MAX_OPERATORS).map((id) => (
        <OperatorBadge key={id} operatorId={id} size="sm" />
      ))}
      {rest.length > 0 && (
        <span className="pl-0.5 text-xs text-text-muted tabular" title={rest.join(', ')}>
          +{rest.length}
          <span className="sr-only"> more: {rest.join(', ')}</span>
        </span>
      )}
    </span>
  );
}

function columns(game: GameIndex, remoteAvatar: boolean): Column<ScoreRow>[] {
  const stat = (
    id: string,
    header: string,
    headerLabel: string,
    player: (p: MatchPlayer) => number | null,
    total: (t: TeamTotals) => number | null,
    format: (value: number | null) => string,
  ): Column<ScoreRow> => ({
    id,
    header,
    ...(headerLabel === header ? {} : { headerLabel }),
    numeric: true,
    width: '4.5rem',
    cell: (row) => format(row.kind === 'player' ? player(row.player) : total(row.totals)),
    sortValue: (row) => playerValue(row, player),
  });
  return [
    {
      id: 'player',
      header: 'Player',
      cell: (row) =>
        row.kind === 'player' ? <PlayerCell player={row.player} remoteAvatar={remoteAvatar} /> : <span className="pl-7 text-text">Team total</span>,
      sortValue: (row) => playerValue(row, (p) => p.name.toLowerCase()),
      firstDirection: 'asc',
    },
    {
      id: 'operators',
      header: 'Operators',
      headerLabel: 'Operators played, most played first',
      width: '10rem',
      cell: (row) => (row.kind === 'player' ? <OperatorsCell ids={row.player.operatorIds} /> : null),
      // Most-played operator, A to Z.
      sortValue: (row) => playerValue(row, (p) => operatorName(game, p.operatorIds[0])),
      firstDirection: 'asc',
    },
    stat('kills', 'K', 'Kills', (p) => p.kills, (t) => t.kills, (v) => formatNumber(v)),
    { ...stat('deaths', 'D', 'Deaths', (p) => p.deaths, (t) => t.deaths, (v) => formatNumber(v)), firstDirection: 'asc' },
    stat('assists', 'A', 'Assists', (p) => p.assists, (t) => t.assists, (v) => formatNumber(v)),
    stat('kd', 'K/D', 'K/D', (p) => kd(p.kills, p.deaths), (t) => t.kd, formatKd),
    stat('hs', 'HS%', 'Headshot percentage', (p) => p.headshotPct, (t) => t.headshotPct, (v) => formatRatio(v)),
    stat('damage', 'Damage', 'Damage', (p) => p.damage, (t) => t.damage, (v) => formatNumber(v)),
    stat('score', 'Score', 'Score', (p) => p.score, (t) => t.score, (v) => formatNumber(v)),
  ];
}

function subtitle(view: MatchView, team: MatchTeam, opponent: MatchTeam): string {
  const result = `${RESULT_VERB[team.result]} ${scoreText(team.score, opponent.score)}`;
  return view.povKnown ? `${TEAM_NAME[team.id]} team · ${result}` : result;
}

interface ScoreboardProps {
  query: QueryLike<MatchView>;
  /** 0 = the point-of-view team (or blue), 1 = the other one. */
  index: 0 | 1;
  /** The route's point of view: names the cards while the match loads. */
  pov: PlayerKey | null;
  busy: boolean;
}

/**
 * One team's scoreboard: avatar and name (a link to the profile when the source names the account), operators played,
 * K, D, A, K/D, HS%, damage and score, sortable by any column (score first), with the team's totals as the last row.
 */
export function Scoreboard({ query, index, pov, busy }: ScoreboardProps) {
  const game = useGame();
  const view = query.data;
  const team = view?.teams[index];
  const opponent = view?.teams[index === 0 ? 1 : 0];
  const fallback = pov ? (index === 0 ? 'Your team' : 'Opponents') : index === 0 ? TEAM_NAME.blue : TEAM_NAME.orange;
  const label = team?.label ?? fallback;
  const remote = view?.match.origin !== 'live'; // design question 20: never remote avatars for a live capture
  const cols = columns(game, remote);
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {team && <TeamSwatch team={team.id} />}
          {label}
        </span>
      }
      subtitle={view && team && opponent ? subtitle(view, team.team, opponent.team) : undefined}
      flush
      query={query}
      skeleton={
        <DataTable
          label={`${label} scoreboard`}
          // Nothing to sort yet: the headers are plain text while the rows load.
          columns={cols.map(({ sortValue: _sort, ...column }) => column)}
          rows={undefined}
          skeletonRows={6}
          rowKey={(_, i) => String(i)}
          className="[&_tbody>tr:last-child>td]:border-b-0"
        />
      }
      isEmpty={(data) => data.teams[index].team.players.length === 0}
      empty={{ title: 'No players listed', description: 'The stats source lists nobody on this team.' }}
    >
      {(data) => {
        const { team: t, totals } = data.teams[index];
        const rows: ScoreRow[] = [...t.players.map((player): ScoreRow => ({ kind: 'player', player })), { kind: 'total', totals }];
        return (
          <DataTable
            label={`${data.teams[index].label} scoreboard`}
            columns={cols}
            rows={rows}
            rowKey={(row) => (row.kind === 'player' ? `slot-${row.player.slot}` : 'total')}
            defaultSort={{ columnId: 'score', direction: 'desc' }}
            isRowCurrent={(row) => row.kind === 'player' && row.player.slot === data.povSlot}
            busy={busy}
            className="[&_tbody>tr:last-child>td]:bg-surface-2/50 [&_tbody>tr:last-child>td]:font-semibold"
          />
        );
      }}
    </SectionCard>
  );
}
