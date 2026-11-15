import type { OperatorId } from '@shared/types/primitives';
import type { MatchStats, OperatorStats } from '@shared/types/stats';
import { damagePerRound, headshotPct } from '@shared/util/stats';

/**
 * Counts, as the generator keeps them. Every number the provider returns is built from these by summing,
 * and ratios are computed from the summed counts only at the end (so a season equals the sum of its matches).
 */
export interface Tally {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  rounds: number;
  roundsWon: number;
  damage: number;
}

export const emptyTally = (): Tally => ({
  matches: 0, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, headshots: 0, rounds: 0, roundsWon: 0, damage: 0,
});

export function addTally(into: Tally, add: Tally): Tally {
  into.matches += add.matches;
  into.wins += add.wins;
  into.losses += add.losses;
  into.kills += add.kills;
  into.deaths += add.deaths;
  into.assists += add.assists;
  into.headshots += add.headshots;
  into.rounds += add.rounds;
  into.roundsWon += add.roundsWon;
  into.damage += add.damage;
  return into;
}

export function subtractTally(from: Tally, sub: Tally): Tally {
  return {
    matches: from.matches - sub.matches,
    wins: from.wins - sub.wins,
    losses: from.losses - sub.losses,
    kills: from.kills - sub.kills,
    deaths: from.deaths - sub.deaths,
    assists: from.assists - sub.assists,
    headshots: from.headshots - sub.headshots,
    rounds: from.rounds - sub.rounds,
    roundsWon: from.roundsWon - sub.roundsWon,
    damage: from.damage - sub.damage,
  };
}

export const toMatchStats = (t: Tally): MatchStats => ({
  matches: t.matches,
  wins: t.wins,
  losses: t.losses,
  kills: t.kills,
  deaths: t.deaths,
  assists: t.assists,
  headshotPct: headshotPct(t.headshots, t.kills),
  rounds: t.rounds,
  damagePerRound: damagePerRound(t.damage, t.rounds),
});

/** Per operator: counted over the rounds it was picked in. */
export interface OperatorTally {
  rounds: number;
  roundsWon: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
}

export const emptyOperatorTally = (): OperatorTally => ({ rounds: 0, roundsWon: 0, kills: 0, deaths: 0, assists: 0, headshots: 0 });

export function addOperatorTally(into: OperatorTally, add: OperatorTally): OperatorTally {
  into.rounds += add.rounds;
  into.roundsWon += add.roundsWon;
  into.kills += add.kills;
  into.deaths += add.deaths;
  into.assists += add.assists;
  into.headshots += add.headshots;
  return into;
}

export const toOperatorStats = (operatorId: OperatorId, t: OperatorTally): OperatorStats => ({
  operatorId,
  rounds: t.rounds,
  roundsWon: t.roundsWon,
  kills: t.kills,
  deaths: t.deaths,
  assists: t.assists,
  headshotPct: headshotPct(t.headshots, t.kills),
});
