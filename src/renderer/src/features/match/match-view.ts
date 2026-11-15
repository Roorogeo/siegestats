import type { GameIndex } from '@shared/game-config';
import type { PlaylistKind } from '@shared/types/game-config';
import type { MatchDetail, MatchPlayer, MatchResult, MatchTeam, RoundOutcome } from '@shared/types/match';
import type { PlayerKey } from '@shared/types/player';
import type { OperatorId, Ratio, TeamId } from '@shared/types/primitives';
import { kd, ratio } from '@shared/util/stats';

/**
 * The match details screen as plain data: which team is listed first, how each team is named, team totals, and the
 * rounds with their running score. Pure and DOM-free, so it can be unit-tested without rendering.
 */

export const TEAM_NAME: Readonly<Record<TeamId, string>> = { blue: 'Blue', orange: 'Orange' };

/** Round outcomes in words, as a player would say them. */
export const OUTCOME_LABEL: Readonly<Record<RoundOutcome, string>> = {
  team_eliminated: 'Team eliminated',
  bomb_detonated: 'Bomb detonated',
  bomb_defused: 'Defused',
  objective_secured: 'Area secured',
  objective_protected: 'Area defended',
  time_expired: 'Time ran out',
  hostage_extracted: 'Hostage extracted',
  hostage_killed: 'Hostage killed',
};

/** The point-of-view team's result as the header says it. */
export const RESULT_WORD: Readonly<Record<MatchResult, string>> = { win: 'Victory', loss: 'Defeat', draw: 'Draw' };
/** A team's result in a sentence ("Won 4-2"). */
export const RESULT_VERB: Readonly<Record<MatchResult, string>> = { win: 'Won', loss: 'Lost', draw: 'Drew' };

export interface TeamTotals {
  kills: number;
  deaths: number;
  /** null when any player's value is unknown: a partial sum would read as the team's real total. */
  assists: number | null;
  kd: number | null;
  /** Headshots over kills for the whole team, rebuilt from each player's ratio and kills. */
  headshotPct: Ratio | null;
  damage: number | null;
  score: number | null;
}

export interface TeamView {
  id: TeamId;
  /** "Your team" / "Opponents" when the point of view is known, otherwise "Blue" / "Orange". */
  label: string;
  /** Holds the point-of-view player (or the recorder of a live capture). */
  isPov: boolean;
  team: MatchTeam;
  totals: TeamTotals;
}

/** Rounds played past regulation: ranked overtime, or the single deciding round of a 3-3 Standard match. */
export type ExtraRound = 'overtime' | 'decider';

export interface RoundView {
  number: number;
  winner: TeamId | null;
  attackers: TeamId | null;
  outcome: RoundOutcome | null;
  extra: ExtraRound | null;
  /** Score after this round, the first-listed team first. null from the first round whose winner is unknown on. */
  score: readonly [number, number] | null;
  /** slot -> operator picked; a slot missing from the source's picks is absent. */
  picks: ReadonlyMap<number, OperatorId | null>;
}

export interface MatchView {
  match: MatchDetail;
  /** The first-listed team holds the point-of-view player: labels say "Your team" / "Opponents". */
  povKnown: boolean;
  /** Slot of the point-of-view player (highlighted), or null. */
  povSlot: number | null;
  /** The row of the player named in the route's ?pov=, for the back link's name (null when not in this match). */
  povPlayer: MatchPlayer | null;
  /** Point-of-view team first, else blue first. */
  teams: readonly [TeamView, TeamView];
  /** null = the source has no round data for this match. */
  rounds: RoundView[] | null;
}

const samePlayer = (a: PlayerKey, b: PlayerKey): boolean => a.platform === b.platform && a.id === b.id;

/** Sum of known values; null as soon as one is unknown. */
function sumKnown(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function teamTotals(players: readonly MatchPlayer[]): TeamTotals {
  const kills = players.reduce((n, p) => n + p.kills, 0);
  const deaths = players.reduce((n, p) => n + p.deaths, 0);
  // A player without kills has no headshot ratio and adds no headshots; one with kills but no ratio makes it unknown.
  const headshots = sumKnown(players.map((p) => (p.kills === 0 ? 0 : p.headshotPct === null ? null : Math.round(p.headshotPct * p.kills))));
  return {
    kills,
    deaths,
    assists: sumKnown(players.map((p) => p.assists)),
    kd: kd(kills, deaths),
    headshotPct: ratio(headshots, kills),
    damage: sumKnown(players.map((p) => p.damage)),
    score: sumKnown(players.map((p) => p.score)),
  };
}

/**
 * When a match goes past regulation. The game config has no match format, so the rule follows the playlist's kind
 * (never its id), as the mock source plays them: Ranked and Legend Division go to overtime at 3-3, Standard plays one
 * deciding round at 3-3. Other kinds, and a playlist the config does not know, mark nothing.
 */
const EXTRA_AFTER_TIE: Partial<Record<PlaylistKind, { at: number; extra: ExtraRound }>> = {
  ranked: { at: 3, extra: 'overtime' },
  legend: { at: 3, extra: 'overtime' },
  standard: { at: 3, extra: 'decider' },
};

/** Builds the screen's view of a match. `pov` is the player the match was opened from (the route's ?pov=). */
export function buildMatchView(match: MatchDetail, pov: PlayerKey | null, game: GameIndex): MatchView {
  const [a, b] = match.teams;
  let povSlot: number | null = null;
  let povTeam: TeamId | null = null;
  let povPlayer: MatchPlayer | null = null;
  if (pov) {
    for (const team of match.teams) {
      const row = team.players.find((p) => p.player !== null && samePlayer(p.player, pov));
      if (!row) continue;
      povTeam = team.id;
      povSlot = row.slot;
      povPlayer = row;
      break;
    }
  }
  // A live capture is seen from the PC that recorded it, unless the route names someone in it.
  if (povTeam === null && match.origin === 'live' && match.recorderSlot !== null) {
    const recorder = match.teams.find((t) => t.players.some((p) => p.slot === match.recorderSlot));
    if (recorder) {
      povTeam = recorder.id;
      povSlot = match.recorderSlot;
    }
  }
  const firstId: TeamId = povTeam ?? 'blue';
  const [first, second] = a.id === firstId ? [a, b] : [b, a];
  const povKnown = povTeam !== null;
  const view = (team: MatchTeam, isPov: boolean): TeamView => ({
    id: team.id,
    label: povKnown ? (isPov ? 'Your team' : 'Opponents') : TEAM_NAME[team.id],
    isPov,
    team,
    totals: teamTotals(team.players),
  });
  const teams = [view(first, povKnown), view(second, false)] as const;
  return { match, povKnown, povSlot, povPlayer, teams, rounds: buildRounds(match, first.id, game) };
}

function buildRounds(match: MatchDetail, firstId: TeamId, game: GameIndex): RoundView[] | null {
  if (match.rounds === null) return null;
  const kind = match.playlistId === null ? null : (game.playlist(match.playlistId)?.kind ?? null);
  const rule = kind === null ? undefined : EXTRA_AFTER_TIE[kind];
  const ordered = [...match.rounds].sort((x, y) => x.number - y.number);
  let own = 0;
  let opp = 0;
  let known = true;
  let extraFrom: number | null = null;
  return ordered.map((round): RoundView => {
    const extra = extraFrom !== null && round.number >= extraFrom && rule ? rule.extra : null;
    if (round.winner === null) known = false;
    else if (round.winner === firstId) own += 1;
    else opp += 1;
    // Past the tie, every further round is played beyond regulation.
    if (known && rule && extraFrom === null && own === rule.at && opp === rule.at) extraFrom = round.number + 1;
    return {
      number: round.number,
      winner: round.winner,
      attackers: round.attackers,
      outcome: round.outcome,
      extra,
      score: known ? [own, opp] : null,
      picks: new Map(round.picks.map((pick) => [pick.slot, pick.operatorId])),
    };
  });
}

/** Players by score, highest first, unknown scores last; ties keep the source's order. The scoreboards' default order. */
export function byScore(players: readonly MatchPlayer[]): MatchPlayer[] {
  return players
    .map((player, index) => ({ player, index }))
    .sort((x, y) => {
      const a = x.player.score;
      const b = y.player.score;
      if (a === b) return x.index - y.index;
      if (a === null) return 1;
      if (b === null) return -1;
      return b - a || x.index - y.index;
    })
    .map((entry) => entry.player);
}

/** The score as "4-2", the given team first. */
export const scoreText = (own: number, opponent: number): string => `${own}-${opponent}`;
