import type { ReactNode } from 'react';
import type { TeamId } from '@shared/types/primitives';
import { cn } from '../../lib/cn';
import { DASH } from '../../lib/format';
import { SectionCard, Skeleton, type QueryLike } from '../../ui';
import { OUTCOME_LABEL, scoreText, TEAM_NAME, type ExtraRound, type MatchView, type RoundView } from './match-view';
import { LABEL_COLUMN, roundTableMinWidth, WON_TINT } from './round-columns';
import { TeamSwatch, useTeamColors } from './team-colors';

const EXTRA_TAG: Readonly<Record<ExtraRound, string>> = { overtime: 'OT', decider: 'Decider' };
const EXTRA_WORDS: Readonly<Record<ExtraRound, string>> = { overtime: 'overtime', decider: 'deciding round' };

/** "Round 7, overtime, won by your team": the column header's name for screen readers. */
export function roundName(view: MatchView, round: RoundView): string {
  const parts = [`Round ${round.number}`];
  if (round.extra) parts.push(EXTRA_WORDS[round.extra]);
  if (view.povKnown && round.winner !== null) parts.push(round.winner === view.teams[0].id ? 'won by your team' : 'lost');
  return parts.join(', ');
}

export const povWon = (view: MatchView, round: RoundView): boolean => view.povKnown && round.winner === view.teams[0].id;

/** The round number, with a small tag on rounds past regulation. */
export function RoundHeading({ view, round, children }: { view: MatchView; round: RoundView; children?: ReactNode }) {
  return (
    <>
      <span aria-hidden className="inline-flex items-center gap-1">
        <span className="text-text tabular">{round.number}</span>
        {round.extra && (
          <span className="rounded-[4px] border border-border bg-surface-2 px-1 text-[10px] leading-4 font-medium text-text-muted">
            {EXTRA_TAG[round.extra]}
          </span>
        )}
        {children}
      </span>
      <span className="sr-only">{roundName(view, round)}</span>
    </>
  );
}

function subtitle(view: MatchView, rounds: readonly RoundView[]): string {
  const count = `${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}`;
  const first = rounds.find((r) => r.extra !== null);
  if (!first?.extra) return count;
  return first.extra === 'overtime' ? `${count} · overtime from round ${first.number}` : `${count} · deciding round ${first.number}`;
}

function Legend({ view }: { view: MatchView }) {
  return (
    <span className="flex items-center gap-3 text-xs text-text-muted">
      {view.teams.map((team) => (
        <span key={team.id} className="flex items-center gap-1.5">
          <TeamSwatch team={team.id} />
          {team.label}
        </span>
      ))}
    </span>
  );
}

const ROW_HEAD = 'border-b border-border px-4 text-left text-xs font-medium whitespace-nowrap text-text-muted';
const CELL = 'border-b border-border text-center';

function TimelineTable({ view, rounds }: { view: MatchView; rounds: readonly RoundView[] }) {
  const colors = useTeamColors();
  const pov = view.povKnown;
  const [first] = view.teams;
  const teamText = (team: TeamId | null): ReactNode =>
    team === null ? (
      <span className="text-text-muted">{DASH}</span>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <TeamSwatch team={team} className="size-2" />
        {view.teams.find((t) => t.id === team)?.label ?? TEAM_NAME[team]}
      </span>
    );
  const last = rounds.length - 1;
  const tint = (round: RoundView): string | false => povWon(view, round) && WON_TINT;

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]" style={{ minWidth: roundTableMinWidth(rounds.length) }}>
        <caption className="sr-only">Round by round</caption>
        <colgroup>
          <col style={{ width: LABEL_COLUMN }} />
          {rounds.map((round) => (
            <col key={round.number} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(ROW_HEAD, 'h-8')}>
              Round
            </th>
            {rounds.map((round) => (
              <th key={round.number} scope="col" className={cn(CELL, 'h-8 px-1 text-xs font-medium', tint(round))}>
                <RoundHeading view={view} round={round} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className={ROW_HEAD}>
              {pov ? 'Result' : 'Winner'}
            </th>
            {rounds.map((round) => (
              <td key={round.number} className={cn(CELL, 'px-0 pt-2 pb-2 align-top', tint(round))} data-testid="round-winner" data-winner={round.winner ?? ''}>
                {/* The strip of winner colours is the timeline at a glance; 1px margins leave a 2px gap between rounds. */}
                <span aria-hidden className={cn('mx-px block h-1.5 rounded-full', round.winner ? colors[round.winner] : 'bg-border')} />
                <span className="mt-1.5 block px-2 text-xs">
                  {round.winner === null ? (
                    <span className="text-text-muted">{DASH}</span>
                  ) : pov ? (
                    round.winner === first.id ? (
                      <span className="font-medium text-text">Won</span>
                    ) : (
                      <span className="text-text-muted">Lost</span>
                    )
                  ) : (
                    teamText(round.winner)
                  )}
                </span>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={ROW_HEAD}>
              {pov ? 'Your side' : 'Attackers'}
            </th>
            {rounds.map((round) => (
              <td key={round.number} className={cn(CELL, 'h-8 px-2 text-xs', tint(round))} data-testid="round-side">
                {round.attackers === null ? (
                  <span className="text-text-muted">{DASH}</span>
                ) : pov ? (
                  <span className={round.attackers === first.id ? 'text-text' : 'text-text-muted'}>{round.attackers === first.id ? 'Attack' : 'Defense'}</span>
                ) : (
                  teamText(round.attackers)
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={ROW_HEAD}>
              How it ended
            </th>
            {rounds.map((round) => (
              <td key={round.number} className={cn(CELL, 'h-10 px-2 py-1 text-xs leading-tight text-text-muted', tint(round))}>
                {round.outcome === null ? DASH : OUTCOME_LABEL[round.outcome]}
              </td>
            ))}
          </tr>
          <tr className="[&>*]:border-b-0">
            <th scope="row" className={ROW_HEAD}>
              Score
              <span className="block text-[11px] font-normal">{pov ? 'Your team first' : `${TEAM_NAME[first.id]} first`}</span>
            </th>
            {rounds.map((round, i) => (
              <td key={round.number} className={cn(CELL, 'h-10 px-2 tabular', i === last ? 'font-semibold text-text' : 'text-text', tint(round))} data-testid="round-score">
                {round.score === null ? <span className="text-text-muted">{DASH}</span> : scoreText(round.score[0], round.score[1])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

/**
 * Round by round: one column per round, with who won it (team colour and words), who attacked, how it ended, and the
 * running score. Overtime rounds are tagged. Rounds the point-of-view team won carry a faint wash.
 */
export function RoundTimeline({ query }: { query: QueryLike<MatchView> }) {
  const view = query.data;
  const rounds = view?.rounds ?? null;
  return (
    <SectionCard
      title="Round by round"
      subtitle={rounds && rounds.length > 0 && view ? subtitle(view, rounds) : undefined}
      actions={view && rounds && rounds.length > 0 ? <Legend view={view} /> : undefined}
      flush
      query={query}
      skeleton={<TimelineSkeleton />}
      isEmpty={(data) => data.rounds === null || data.rounds.length === 0}
      empty={{ title: 'This source has no round data for this match' }}
    >
      {(data) => <TimelineTable view={data} rounds={data.rounds ?? []} />}
    </SectionCard>
  );
}
