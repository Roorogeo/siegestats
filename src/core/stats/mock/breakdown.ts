import type { MapId, OperatorId, Side } from '@shared/types/primitives';
import type { Random } from '@shared/util/random';
import { addTally, emptyOperatorTally, emptyTally, type Tally } from './tally';
import type { OperatorTallies } from './world';

/**
 * Breaks one playlist line of a summary-only season (a season before the generated window, which has totals but no
 * listed matches) into per-map and per-operator counts. Every split is in whole numbers that add up exactly to the
 * line, so a season's Maps and Operators lists sum to its record, as they do for seasons built from matches.
 *
 * This runs for every playlist line of every summary season (~13,000 per world), so it uses plain arrays and no
 * per-call scratch beyond its results.
 */

/**
 * Whole parts of `total` in proportion to `weights`, adding up to `total` exactly. Each part gets the floor of its
 * quota; the units left over go one at a time to a part drawn in proportion to the fraction it lost. So a part
 * with weight 0 never gets anything, and a small weight gets a unit now and then rather than never.
 */
export function apportion(rng: Random, total: number, weights: readonly number[]): number[] {
  const n = weights.length;
  const out = new Array<number>(n).fill(0);
  let sum = 0;
  let heaviest = -1;
  for (let i = 0; i < n; i += 1) {
    const w = weights[i] as number;
    if (w <= 0) continue;
    sum += w;
    if (heaviest < 0 || w > (weights[heaviest] as number)) heaviest = i;
  }
  if (total <= 0 || heaviest < 0) return out;
  const lost = new Array<number>(n).fill(0);
  let given = 0;
  let lostSum = 0;
  for (let i = 0; i < n; i += 1) {
    const w = weights[i] as number;
    if (w <= 0) continue;
    const quota = (total * w) / sum;
    const whole = Math.floor(quota);
    out[i] = whole;
    given += whole;
    lost[i] = quota - whole;
    lostSum += quota - whole;
  }
  for (let left = total - given; left > 0; left -= 1) {
    let roll = rng.next() * lostSum;
    let pick = -1;
    for (let i = 0; i < n; i += 1) {
      const f = lost[i] as number;
      if (f <= 0) continue;
      pick = i;
      roll -= f;
      if (roll < 0) break;
    }
    if (pick < 0) pick = heaviest; // floating-point leftovers
    out[pick] = (out[pick] as number) + 1;
    lostSum -= lost[pick] as number;
    lost[pick] = 0;
  }
  return out;
}

/**
 * Whole parts of `total` in proportion to `shares`, adding up to `total` exactly, part i within [lo[i], hi[i]]
 * (0 and no upper bound when the array is null). Each part takes its rounded share of what is left, clamped so that
 * the parts after it can still take the rest; that always works when sum(lo) <= total <= sum(hi).
 */
export function splitBounded(total: number, shares: readonly number[], lo: readonly number[] | null, hi: readonly number[] | null): number[] {
  const n = shares.length;
  let restShare = 0;
  let restLo = 0;
  let restHi = 0;
  for (let i = 0; i < n; i += 1) {
    restShare += Math.max(0, shares[i] as number);
    if (lo) restLo += lo[i] as number;
    if (hi) restHi += hi[i] as number;
  }
  const out = new Array<number>(n);
  let left = total;
  for (let i = 0; i < n; i += 1) {
    const share = Math.max(0, shares[i] as number);
    const ideal = restShare > 0 ? (left * share) / restShare : left / (n - i);
    const ownLo = lo ? (lo[i] as number) : 0;
    const ownHi = hi ? (hi[i] as number) : Infinity;
    restShare -= share;
    restLo -= ownLo;
    restHi -= hi ? ownHi : 0;
    // What the parts after this one can still take: at least restLo, at most restHi.
    const min = Math.max(ownLo, hi ? left - restHi : -Infinity);
    const max = Math.min(ownHi, left - restLo);
    const v = Math.min(max, Math.max(min, Math.round(ideal)));
    out[i] = v;
    left -= v;
  }
  return out;
}

const scaled = (values: readonly number[], factors: readonly number[], invert = false): number[] =>
  values.map((v, k) => (invert ? v / (factors[k] as number) : v * (factors[k] as number)));

/** A per-part factor in [0.8, 1.25]: some maps and operators go better than others. */
const formOf = (rng: Random, n: number): number[] => {
  const out = new Array<number>(n);
  for (let k = 0; k < n; k += 1) out[k] = rng.float(0.8, 1.25);
  return out;
};

/**
 * The line's counts per map. `weights` (by position in `mapIds`) say how often each map comes up; 0 = never.
 * `perMatch` is the playlist's rounds per match (roundsPerMatch()): each map's rounds stay within its matches times
 * those bounds, and its rounds won leave `min` rounds won per win and `min` rounds lost per loss. The line must be
 * within the same bounds (its matches, wins and losses as a whole).
 */
export function splitOverMaps(
  rng: Random,
  line: Tally,
  mapIds: readonly MapId[],
  weights: readonly number[],
  perMatch: { min: number; max: number },
): Map<MapId, Tally> {
  const all = apportion(rng, line.matches, weights);
  const parts: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < mapIds.length; i += 1) {
    const matches = all[i] as number;
    if (matches > 0) {
      parts.push(i);
      m.push(matches);
    }
  }
  const form = formOf(rng, parts.length);
  const pace = formOf(rng, parts.length); // some maps run to more rounds per match than others
  const wins = splitBounded(line.wins, scaled(m, form), null, m);
  const rounds = splitBounded(line.rounds, scaled(m, pace), m.map((x) => x * perMatch.min), m.map((x) => x * perMatch.max));
  const roundsWon = splitBounded(
    line.roundsWon,
    scaled(rounds, form),
    wins.map((w) => w * perMatch.min),
    rounds.map((r, k) => r - ((m[k] as number) - (wins[k] as number)) * perMatch.min),
  );
  const kills = splitBounded(line.kills, scaled(rounds, form), null, null);
  const deaths = splitBounded(line.deaths, scaled(rounds, form, true), null, rounds);
  const assists = splitBounded(line.assists, rounds, null, null);
  const headshots = splitBounded(line.headshots, kills, null, kills);
  const damage = splitBounded(line.damage, scaled(rounds, form), null, null);

  const out = new Map<MapId, Tally>();
  parts.forEach((i, k) => {
    const matches = m[k] as number;
    const w = wins[k] as number;
    out.set(mapIds[i] as MapId, {
      matches,
      wins: w,
      losses: matches - w,
      kills: kills[k] as number,
      deaths: deaths[k] as number,
      assists: assists[k] as number,
      headshots: headshots[k] as number,
      rounds: rounds[k] as number,
      roundsWon: roundsWon[k] as number,
      damage: damage[k] as number,
    });
  });
  return out;
}

/** One operator on one side: a part of a per-operator split. */
export interface OperatorSlot {
  side: Side;
  operatorId: OperatorId;
}

/**
 * The line's rounds, rounds won, kills, deaths, assists and headshots per side and operator. `weights` (by position
 * in `slots`) are pick weights: 0 = never picked (e.g. not released yet that season).
 */
export function splitOverOperators(rng: Random, line: Tally, slots: readonly OperatorSlot[], weights: readonly number[]): OperatorTallies {
  const all = apportion(rng, line.rounds, weights);
  const parts: number[] = [];
  const r: number[] = [];
  for (let i = 0; i < slots.length; i += 1) {
    const rounds = all[i] as number;
    if (rounds > 0) {
      parts.push(i);
      r.push(rounds);
    }
  }
  const form = formOf(rng, parts.length);
  const roundsWon = splitBounded(line.roundsWon, scaled(r, form), null, r);
  const kills = splitBounded(line.kills, scaled(r, form), null, null);
  const deaths = splitBounded(line.deaths, scaled(r, form, true), null, r);
  const assists = splitBounded(line.assists, r, null, null);
  const headshots = splitBounded(line.headshots, kills, null, kills);

  const out: OperatorTallies = { attack: new Map(), defense: new Map() };
  parts.forEach((i, k) => {
    const slot = slots[i] as OperatorSlot;
    out[slot.side].set(slot.operatorId, {
      rounds: r[k] as number,
      roundsWon: roundsWon[k] as number,
      kills: kills[k] as number,
      deaths: deaths[k] as number,
      assists: assists[k] as number,
      headshots: headshots[k] as number,
    });
  });
  return out;
}

/** Adds `add` into `into`, per side and operator (new entries are copies). */
export function mergeOperatorTallies(into: OperatorTallies, add: OperatorTallies): void {
  for (const side of ['attack', 'defense'] as const) {
    for (const [id, t] of add[side]) {
      const existing = into[side].get(id) ?? emptyOperatorTally();
      into[side].set(id, existing);
      existing.rounds += t.rounds;
      existing.roundsWon += t.roundsWon;
      existing.kills += t.kills;
      existing.deaths += t.deaths;
      existing.assists += t.assists;
      existing.headshots += t.headshots;
    }
  }
}

/** Adds every map tally of `add` into `into` (new entries are copies). */
export function mergeMapTallies(into: Map<MapId, Tally>, add: ReadonlyMap<MapId, Tally>): void {
  for (const [id, t] of add) into.set(id, addTally(into.get(id) ?? emptyTally(), t));
}
