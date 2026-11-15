import { describe, expect, test } from 'vitest';
import { apportion, splitBounded, splitOverMaps, splitOverOperators, type OperatorSlot } from '@core/stats/mock/breakdown';
import type { Tally } from '@core/stats/mock/tally';
import type { MapId, OperatorId } from '@shared/types/primitives';
import { createRandom } from '@shared/util/random';

const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

describe('apportion', () => {
  test('whole parts that add up exactly; weight 0 gets nothing; the same seed gives the same split', () => {
    const rng = createRandom('apportion');
    for (let trial = 0; trial < 200; trial += 1) {
      const n = rng.int(1, 40);
      const weights: number[] = Array.from({ length: n }, () => (rng.chance(0.2) ? 0 : rng.float(0.01, 5)));
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const total = rng.int(0, 600);
      const parts = apportion(createRandom(trial), total, weights);
      expect(sum(parts)).toBe(total);
      parts.forEach((p, i) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        if (weights[i] === 0) expect(p).toBe(0);
        // Never more than one unit away from the exact quota.
        const quota = (total * (weights[i] ?? 0)) / sum(weights);
        expect(Math.abs(p - quota)).toBeLessThan(1);
      });
      expect(apportion(createRandom(trial), total, weights)).toEqual(parts);
    }
  });

  test('a small weight gets a unit now and then, not never (a thin tail)', () => {
    const weights = [10, 5, ...Array.from({ length: 30 }, () => 0.05)];
    let tail = 0;
    for (let seed = 0; seed < 50; seed += 1) tail += sum(apportion(createRandom(seed), 40, weights).slice(2));
    expect(tail).toBeGreaterThan(0);
    expect(tail / 50).toBeLessThan(40 * 0.15);
  });

  test('nothing to give, or nobody to give it to', () => {
    expect(apportion(createRandom(1), 0, [1, 2])).toEqual([0, 0]);
    expect(apportion(createRandom(1), 5, [0, 0])).toEqual([0, 0]);
  });
});

describe('splitBounded', () => {
  test('adds up exactly and keeps every part inside its bounds when that is possible', () => {
    const rng = createRandom('bounded');
    for (let trial = 0; trial < 300; trial += 1) {
      const n = rng.int(1, 25);
      const lo = Array.from({ length: n }, () => rng.int(0, 5));
      const hi = lo.map((l) => l + rng.int(0, 20));
      const total = rng.int(sum(lo), sum(hi));
      const shares = Array.from({ length: n }, () => (rng.chance(0.1) ? 0 : rng.float(0, 10)));
      const parts = splitBounded(total, shares, lo, hi);
      expect(sum(parts)).toBe(total);
      parts.forEach((p, i) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(lo[i] ?? 0);
        expect(p).toBeLessThanOrEqual(hi[i] ?? 0);
      });
    }
  });

  test('without bounds, parts follow the shares', () => {
    expect(splitBounded(10, [1, 1], null, null)).toEqual([5, 5]);
    expect(splitBounded(9, [2, 1], null, null)).toEqual([6, 3]);
    expect(splitBounded(3, [0, 0, 0], null, null)).toEqual([1, 1, 1]);
    expect(splitBounded(7, [1, 1], null, [2, 10])).toEqual([2, 5]);
  });
});

describe('summary-season breakdowns', () => {
  const line: Tally = { matches: 37, wins: 21, losses: 16, kills: 230, deaths: 170, assists: 70, headshots: 101, rounds: 270, roundsWon: 145, damage: 30_000 };

  test('per map: every count adds up to the line, and each map is a believable set of matches', () => {
    const ids = ['bank', 'border', 'chalet', 'oregon', 'villa', 'house'] as MapId[];
    const maps = splitOverMaps(createRandom('maps'), line, ids, [1, 1.4, 0.6, 1, 0.8, 0]);
    expect(maps.has('house' as MapId)).toBe(false);
    for (const key of Object.keys(line) as (keyof Tally)[]) expect(sum([...maps.values()].map((t) => t[key])), key).toBe(line[key]);
    for (const t of maps.values()) {
      expect(t.matches).toBeGreaterThan(0);
      expect(t.wins + t.losses).toBe(t.matches);
      expect(t.rounds).toBeGreaterThanOrEqual(t.matches);
      expect(t.roundsWon).toBeLessThanOrEqual(t.rounds);
      expect(t.deaths).toBeLessThanOrEqual(t.rounds);
      expect(t.headshots).toBeLessThanOrEqual(t.kills);
    }
  });

  test('per operator: rounds and the rest add up to the line; weight 0 is never picked', () => {
    const slots: OperatorSlot[] = [
      { side: 'attack', operatorId: 'ash' as OperatorId },
      { side: 'attack', operatorId: 'thermite' as OperatorId },
      { side: 'attack', operatorId: 'noor' as OperatorId },
      { side: 'defense', operatorId: 'mute' as OperatorId },
      { side: 'defense', operatorId: 'smoke' as OperatorId },
    ];
    const ops = splitOverOperators(createRandom('ops'), line, slots, [0.3, 0.2, 0, 0.35, 0.15]);
    const all = [...ops.attack.values(), ...ops.defense.values()];
    expect(ops.attack.has('noor' as OperatorId)).toBe(false);
    for (const key of ['rounds', 'roundsWon', 'kills', 'deaths', 'assists', 'headshots'] as const) expect(sum(all.map((t) => t[key])), key).toBe(line[key]);
    for (const t of all) {
      expect(t.rounds).toBeGreaterThan(0);
      expect(t.roundsWon).toBeLessThanOrEqual(t.rounds);
      expect(t.deaths).toBeLessThanOrEqual(t.rounds);
      expect(t.headshots).toBeLessThanOrEqual(t.kills);
    }
  });
});
