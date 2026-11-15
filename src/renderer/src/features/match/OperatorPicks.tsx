import { Check } from 'lucide-react';
import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { MatchPlayer } from '@shared/types/match';
import type { OperatorId, PlayerId } from '@shared/types/primitives';
import { useGame } from '../../app/GameConfigProvider';
import { Avatar, OperatorBadge, SIDE_LABEL } from '../../components';
import { cn } from '../../lib/cn';
import { DASH } from '../../lib/format';
import { FLOATING_SHADOW, gridTarget, SectionCard, Skeleton, type GridCell, type QueryLike } from '../../ui';
import { byScore, type MatchView, type RoundView } from './match-view';
import { LABEL_COLUMN, roundTableMinWidth, WON_TINT } from './round-columns';
import { povWon, RoundHeading } from './RoundTimeline';
import { TeamSwatch } from './team-colors';

/** The pick in a cell, in words, shown above the cell while it has keyboard focus. */
function PickTooltip({ operatorId, round, player, alignEnd }: { operatorId: OperatorId | null; round: number; player: string; alignEnd: boolean }) {
  const game = useGame();
  const operator = operatorId === null ? null : game.operator(operatorId);
  const name = operatorId === null ? 'No pick recorded' : (operator?.name ?? 'Unknown operator');
  return (
    // The cell's own name already says this to screen readers; the box is for the eyes.
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute bottom-full z-20 mb-1 flex flex-col items-start rounded-control border border-border bg-surface px-2 py-1 text-left text-xs whitespace-nowrap',
        FLOATING_SHADOW,
        alignEnd ? 'right-0' : 'left-1/2 -translate-x-1/2',
      )}
    >
      <span className="font-semibold text-text">
        {name}
        {operator?.side && <span className="font-normal text-text-muted"> · {SIDE_LABEL[operator.side]}</span>}
      </span>
      <span className="text-text-muted">
        Round {round} · {player}
      </span>
    </span>
  );
}

interface GridRow {
  player: MatchPlayer;
  /** Row number among all players, both teams, for keyboard movement. */
  index: number;
}

function PicksGrid({ view, rounds }: { view: MatchView; rounds: readonly RoundView[] }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [active, setActive] = useState<GridCell>({ row: 0, col: 0 });
  const [shown, setShown] = useState<GridCell | null>(null);
  const [first, second] = view.teams;
  // Same order as the scoreboards above (by score), so a player is found in the same place.
  const groups = [
    { team: first, rows: byScore(first.team.players).map((player, i): GridRow => ({ player, index: i })) },
    { team: second, rows: byScore(second.team.players).map((player, i): GridRow => ({ player, index: first.team.players.length + i })) },
  ];
  const rowCount = first.team.players.length + second.team.players.length;
  const cols = rounds.length;

  const focusCell = (cell: GridCell): void => {
    tableRef.current?.querySelector<HTMLElement>(`[data-cell="${cell.row}:${cell.col}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, at: GridCell): void => {
    const next = gridTarget(event.key, { ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey }, at, rowCount, cols);
    if (!next) {
      if (event.key === 'Escape') setShown(null);
      return;
    }
    event.preventDefault();
    focusCell(next);
  };
  const onFocus = (event: FocusEvent<HTMLElement>, at: GridCell): void => {
    setActive(at);
    // Keyboard focus shows the name; a pointer already gets the badge's own title.
    setShown(event.currentTarget.matches(':focus-visible') ? at : null);
  };

  return (
    <div className="overflow-x-auto">
      <table
        ref={tableRef}
        role="grid"
        aria-label="Operator picks per round"
        className="w-full table-fixed border-separate border-spacing-0 text-[13px]"
        style={{ minWidth: roundTableMinWidth(cols) }}
      >
        <colgroup>
          <col style={{ width: LABEL_COLUMN }} />
          {rounds.map((round) => (
            <col key={round.number} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="h-8 border-b border-border px-4 text-left text-xs font-medium text-text-muted">
              Player
            </th>
            {rounds.map((round) => {
              const won = povWon(view, round);
              return (
                <th key={round.number} scope="col" className={cn('h-8 border-b border-border px-1 text-center text-xs font-medium', won && WON_TINT)}>
                  <RoundHeading view={view} round={round}>
                    {won && <Check className="size-3 text-positive" aria-hidden />}
                  </RoundHeading>
                </th>
              );
            })}
          </tr>
        </thead>
        {groups.map(({ team, rows }) => (
          <tbody key={team.id}>
            <tr>
              <th scope="rowgroup" colSpan={cols + 1} className="h-7 border-b border-border bg-surface-2/60 px-4 text-left text-xs font-medium text-text-muted">
                <span className="flex items-center gap-2">
                  <TeamSwatch team={team.id} />
                  {team.label}
                </span>
              </th>
            </tr>
            {rows.map(({ player, index: r }) => {
              const isPov = player.slot === view.povSlot;
              return (
                <tr key={player.slot} data-testid="picks-row" data-team={team.id}>
                  <th
                    scope="row"
                    aria-current={isPov || undefined}
                    className={cn(
                      'h-9 border-b border-border px-4 text-left font-normal',
                      isPov && 'relative bg-surface-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent-text',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar
                        player={{ id: (player.player?.id ?? player.name) as PlayerId, name: player.name, avatarUrl: player.player?.avatarUrl ?? null }}
                        size="sm"
                        remote={view.match.origin !== 'live'}
                      />
                      <span className="min-w-0 truncate text-text">{player.name}</span>
                    </span>
                  </th>
                  {rounds.map((round, c) => {
                    const at = { row: r, col: c };
                    const has = round.picks.has(player.slot);
                    const pick = round.picks.get(player.slot) ?? null;
                    const isShown = shown?.row === r && shown.col === c;
                    return (
                      <td
                        key={round.number}
                        role="gridcell"
                        data-cell={`${r}:${c}`}
                        data-round={round.number}
                        tabIndex={active.row === r && active.col === c ? 0 : -1}
                        onKeyDown={(event) => onKeyDown(event, at)}
                        onFocus={(event) => onFocus(event, at)}
                        onBlur={() => setShown(null)}
                        className={cn(
                          'relative h-9 border-b border-border px-1 text-center focus-visible:-outline-offset-2',
                          povWon(view, round) && WON_TINT,
                        )}
                      >
                        {pick !== null ? (
                          <OperatorBadge operatorId={pick} size="md" />
                        ) : (
                          <>
                            <span aria-hidden className="text-text-muted">
                              {DASH}
                            </span>
                            <span className="sr-only">{has ? 'No pick recorded' : 'Not in this round'}</span>
                          </>
                        )}
                        {isShown && <PickTooltip operatorId={pick} round={round.number} player={player.name} alignEnd={c >= cols - 2 && cols > 2} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function PicksSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

/**
 * Operator picks per round: one row per player (grouped by team, point-of-view team first), one column per round,
 * the operator each player picked that round. Attackers' picks only appear on their attacking rounds because that is
 * what the source records. Arrow keys move between cells; the focused cell names its operator.
 */
export function OperatorPicks({ query }: { query: QueryLike<MatchView> }) {
  return (
    <SectionCard
      title="Operator picks per round"
      subtitle={query.data?.povKnown && query.data.rounds?.length ? 'Rounds your team won are ticked' : undefined}
      flush
      query={query}
      skeleton={<PicksSkeleton />}
      isEmpty={(data) => data.rounds === null || data.rounds.length === 0}
      empty={{ title: 'No operator picks', description: 'This source has no round data for this match.' }}
    >
      {(data) => <PicksGrid view={data} rounds={data.rounds ?? []} />}
    </SectionCard>
  );
}
