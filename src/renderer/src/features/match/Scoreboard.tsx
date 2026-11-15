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
import { DataTable, SectionCard, type Column, type QueryLike, type SortDirection } from '../../ui';
import { RESULT_VERB, scoreText, TEAM_NAME, type MatchView, type TeamTotals } from './match-view';
import { TeamSwatch } from './team-colors';

/** Operators shown in a row; the rest are summed up as "+N" (a 9-round match can see 9 different picks). */
const MAX_OPERATORS = 5;

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

/** A figure column: the player's value in a row, the team's in the footer. */
interface Stat {
  id: string;
  header: string;
  headerLabel: string;
  player(p: MatchPlayer): number | null;
  total(t: TeamTotals): number | null;
  format(value: number | null): string;
  firstDirection?: SortDirection;
}

const count = (value: number | null): string => formatNumber(value);
const STATS: readonly Stat[] = [
  { id: 'kills', header: 'K', headerLabel: 'Kills', player: (p) => p.kills, total: (t) => t.kills, format: count },
  { id: 'deaths', header: 'D', headerLabel: 'Deaths', player: (p) => p.deaths, total: (t) => t.deaths, format: count, firstDirection: 'asc' },
  { id: 'assists', header: 'A', headerLabel: 'Assists', player: (p) => p.assists, total: (t) => t.assists, format: count },
  { id: 'kd', header: 'K/D', headerLabel: 'K/D', player: (p) => kd(p.kills, p.deaths), total: (t) => t.kd, format: formatKd },
  { id: 'hs', header: 'HS%', headerLabel: 'Headshot percentage', player: (p) => p.headshotPct, total: (t) => t.headshotPct, format: (v) => formatRatio(v) },
  { id: 'damage', header: 'Damage', headerLabel: 'Damage', player: (p) => p.damage, total: (t) => t.damage, format: count },
  { id: 'score', header: 'Score', headerLabel: 'Score', player: (p) => p.score, total: (t) => t.score, format: count },
];

function columns(game: GameIndex, remoteAvatar: boolean): Column<MatchPlayer>[] {
  return [
    {
      id: 'player',
      header: 'Player',
      cell: (p) => <PlayerCell player={p} remoteAvatar={remoteAvatar} />,
      sortValue: (p) => p.name.toLowerCase(),
      firstDirection: 'asc',
    },
    {
      id: 'operators',
      header: 'Operators',
      headerLabel: 'Operators played, most played first',
      width: '10rem',
      cell: (p) => <OperatorsCell ids={p.operatorIds} />,
      // Most-played operator, A to Z.
      sortValue: (p) => operatorName(game, p.operatorIds[0]),
      firstDirection: 'asc',
    },
    ...STATS.map(
      (stat): Column<MatchPlayer> => ({
        id: stat.id,
        header: stat.header,
        ...(stat.headerLabel === stat.header ? {} : { headerLabel: stat.headerLabel }),
        numeric: true,
        width: '4.5rem',
        cell: (p) => stat.format(stat.player(p)),
        sortValue: stat.player,
        ...(stat.firstDirection ? { firstDirection: stat.firstDirection } : {}),
      }),
    ),
  ];
}

/** The team's totals under the players: the footer row, whatever the sort. */
function TotalsRow({ totals }: { totals: TeamTotals }) {
  return (
    <tr>
      <th scope="row">
        <span className="pl-7">Team total</span>
      </th>
      <td />
      {STATS.map((stat) => (
        <td key={stat.id} className="text-right tabular">
          {stat.format(stat.total(totals))}
        </td>
      ))}
    </tr>
  );
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
 * K, D, A, K/D, HS%, damage and score, sortable by any column (score first), with the team's totals in the footer.
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
        />
      }
      isEmpty={(data) => data.teams[index].team.players.length === 0}
      empty={{ title: 'No players listed', description: 'The stats source lists nobody on this team.' }}
    >
      {(data) => {
        const { team: t, totals } = data.teams[index];
        return (
          <DataTable
            label={`${data.teams[index].label} scoreboard`}
            columns={cols}
            rows={t.players}
            rowKey={(p) => `slot-${p.slot}`}
            defaultSort={{ columnId: 'score', direction: 'desc' }}
            isRowCurrent={(p) => p.slot === data.povSlot}
            busy={busy}
            footer={<TotalsRow totals={totals} />}
          />
        );
      }}
    </SectionCard>
  );
}
