import type { Ratio } from '../types/primitives';

/**
 * The only place ratios are computed from counts (see the conventions in types/primitives.ts).
 * Every helper returns null when there is nothing to divide by, so the UI shows "-" instead of 0 or NaN.
 */

/** numerator / denominator, or null when the denominator is 0 (or either side is unknown). */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

/** Kills per death. A deathless player's K/D equals their kills (deaths count as at least 1); null with no kills and no deaths. */
export function kd(kills: number, deaths: number): number | null {
  if (kills === 0 && deaths === 0) return null;
  return kills / Math.max(deaths, 1);
}

/** Share of decided matches won. Draws do not count either way. */
export const winRate = (wins: number, losses: number): Ratio | null => ratio(wins, wins + losses);

export const killsPerMatch = (kills: number, matches: number): number | null => ratio(kills, matches);

export const roundWinRate = (roundsWon: number, rounds: number): Ratio | null => ratio(roundsWon, rounds);

/** Share of kills that were headshots. */
export const headshotPct = (headshots: number, kills: number): Ratio | null => ratio(headshots, kills);

export const damagePerRound = (damage: number | null, rounds: number | null): number | null => ratio(damage, rounds);
