import { describe, expect, test } from 'vitest';
import { canonicalJson, jsonCopy } from '@shared/util/json';
import { createRandom, hashSeed } from '@shared/util/random';
import { damagePerRound, headshotPct, kd, killsPerMatch, ratio, roundWinRate, winRate } from '@shared/util/stats';
import { addMs, isIsoDateTime, toIso, toMs } from '@shared/util/time';
import type { IsoDateTime } from '@shared/types/primitives';

describe('stat helpers', () => {
  test('a zero denominator gives null, never 0 or NaN', () => {
    expect(kd(0, 0)).toBeNull();
    expect(kd(5, 0)).toBe(5); // deaths count as at least one
    expect(kd(0, 4)).toBe(0);
    expect(kd(12, 8)).toBe(1.5);
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(3, 1)).toBe(0.75);
    expect(killsPerMatch(10, 0)).toBeNull();
    expect(killsPerMatch(10, 4)).toBe(2.5);
    expect(roundWinRate(0, 0)).toBeNull();
    expect(roundWinRate(4, 7)).toBeCloseTo(4 / 7);
    expect(headshotPct(0, 0)).toBeNull();
    expect(headshotPct(5, 10)).toBe(0.5);
    expect(damagePerRound(null, 10)).toBeNull();
    expect(damagePerRound(1500, 0)).toBeNull();
    expect(damagePerRound(1500, 10)).toBe(150);
    expect(ratio(1, null)).toBeNull();
  });
});

describe('seeded random', () => {
  test('the same seed gives the same sequence; another seed a different one', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const c = createRandom(43);
    const seq = (r: ReturnType<typeof createRandom>) => Array.from({ length: 20 }, () => r.next());
    const sa = seq(a);
    expect(seq(b)).toEqual(sa);
    expect(seq(c)).not.toEqual(sa);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  test('helpers stay in range and forks are independent of the parent stream', () => {
    const r = createRandom('helpers');
    for (let i = 0; i < 500; i += 1) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(r.weighted([['never', 0], ['always', 1]])).toBe('always');
    expect(() => r.pick([])).toThrow();
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    const before = createRandom('x');
    const after = createRandom('x');
    after.fork('child').next();
    expect(after.next()).toBe(before.next());
    expect(createRandom('x').fork('a').next()).toBe(createRandom('x').fork('a').next());
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
  });

  test('normal() has roughly the asked mean and spread', () => {
    const r = createRandom(7);
    const xs = Array.from({ length: 4000 }, () => r.normal(10, 2));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeGreaterThan(9.8);
    expect(mean).toBeLessThan(10.2);
    expect(sd).toBeGreaterThan(1.85);
    expect(sd).toBeLessThan(2.15);
  });
});

describe('canonical JSON', () => {
  test('key order does not matter at any depth; array order does', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(canonicalJson({ a: { c: null, d: [2, 1] }, b: 1 }));
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson('m-1')).toBe('"m-1"');
  });

  test('jsonCopy shares nothing with its input', () => {
    const input = { a: { b: [1, 2] } };
    const copy = jsonCopy(input);
    copy.a.b.push(3);
    expect(input.a.b).toEqual([1, 2]);
  });
});

describe('time helpers', () => {
  test('strict UTC ISO strings only', () => {
    expect(isIsoDateTime('2026-11-15T12:00:00.000Z')).toBe(true);
    expect(isIsoDateTime('2026-11-15T12:00:00Z')).toBe(true);
    expect(isIsoDateTime('2026-11-15')).toBe(false);
    expect(isIsoDateTime('2026-11-15T12:00:00+01:00')).toBe(false);
    expect(isIsoDateTime('2026-13-45T12:00:00.000Z')).toBe(false);
    expect(isIsoDateTime(12)).toBe(false);
    const t = '2026-11-15T12:00:00.000Z' as IsoDateTime;
    expect(addMs(t, 60_000)).toBe('2026-11-15T12:01:00.000Z');
    expect(toIso(toMs(t))).toBe(t);
  });
});
