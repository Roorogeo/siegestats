import { describe, expect, test } from 'vitest';
import { pointsSeries, sessionStarts } from '@renderer/charts/points-series';
import { pointsAxis, rankAxis } from '@renderer/charts/rank-axis';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { RankDef } from '@shared/types/game-config';
import type { MatchSummary } from '@shared/types/match';
import type { IsoDateTime, MatchId, PlaylistId, RankId, RankTierId, SeasonId } from '@shared/types/primitives';

/** A fixture ladder (tests may name ranks; src/ may not): 3 tiers of 3 divisions of 100, open-ended top. */
const rank = (tier: string, n: number, min: number, max: number | null): RankDef => ({
  id: `t.${tier}-${n}` as RankId,
  tierId: `t.${tier}` as RankTierId,
  name: `${tier} ${n}`,
  shortName: `${tier[0]?.toUpperCase()}${n}`,
  minPoints: min,
  maxPoints: max,
});
const LADDER: RankDef[] = [
  rank('bronze', 3, 1000, 1099), rank('bronze', 2, 1100, 1199), rank('bronze', 1, 1200, 1299),
  rank('silver', 3, 1300, 1399), rank('silver', 2, 1400, 1499), rank('silver', 1, 1500, 1599),
  rank('gold', 3, 1600, 1699), rank('gold', 2, 1700, 1799), rank('gold', 1, 1800, null),
];

describe('rankAxis', () => {
  test('ticks on the division boundaries around the data, labelled with the division that starts there', () => {
    const axis = rankAxis(LADDER, 1150, 1420);
    expect(axis.kind).toBe('rank');
    expect(axis.domain).toEqual([1100, 1500]);
    expect(axis.ticks).toEqual([1100, 1200, 1300, 1400, 1500]);
    expect(axis.ticks.map(axis.label)).toEqual(['B2', 'B1', 'S3', 'S2', '']);
    expect(axis.labelsBandAbove).toBe(true);
  });

  test('a value exactly on a boundary stays inside the domain, in the division it starts', () => {
    const axis = rankAxis(LADDER, 1300, 1300);
    expect(axis.domain).toEqual([1300, 1400]);
    expect(axis.label(1300)).toBe('S3');
  });

  test('too many boundaries: tier starts are kept', () => {
    const axis = rankAxis(LADDER, 1000, 1750, { maxTicks: 4 });
    expect(axis.domain).toEqual([1000, 1800]);
    expect(axis.ticks).toEqual([1000, 1300, 1600]);
    expect(axis.ticks.map(axis.label)).toEqual(['B3', 'S3', 'G3']);
  });

  test('still too many after that: thinned evenly', () => {
    const axis = rankAxis(LADDER, 1000, 1750, { maxTicks: 2 });
    expect(axis.ticks.length).toBeLessThanOrEqual(2);
    expect(axis.ticks[0]).toBe(1000);
  });

  test('the open-ended top division gets room up to the next round step', () => {
    const axis = rankAxis(LADDER, 1750, 1980);
    expect(axis.domain).toEqual([1700, 2000]);
    expect(axis.ticks).toEqual([1700, 1800]);
    expect(axis.label(1800)).toBe('G1');
  });

  test('points below the lowest division: a plain number at the bottom, then the ladder', () => {
    const axis = rankAxis(LADDER, 940, 1050);
    expect(axis.domain).toEqual([900, 1100]);
    expect(axis.ticks).toEqual([900, 1000, 1100]);
    expect(axis.label(900)).toBe('900');
    expect(axis.label(1000)).toBe('B3');
  });

  test('no ranks: a plain points axis', () => {
    expect(rankAxis([], 10, 20).kind).toBe('points');
  });

  test('works on every ladder in the bundled config', () => {
    const game = createGameIndex(loadBundledGameConfig());
    for (const system of game.config.rankSystems) {
      const first = system.ranks[0];
      const last = system.ranks.at(-1);
      if (!first || !last) continue;
      const axis = rankAxis(system.ranks, first.minPoints + 10, last.minPoints + 10, { maxTicks: 9 });
      expect(axis.ticks.length).toBeLessThanOrEqual(9);
      expect(axis.domain[0]).toBe(first.minPoints);
      expect(axis.domain[1]).toBeGreaterThan(last.minPoints);
      for (const tick of axis.ticks) expect(axis.label(tick)).toBe(system.ranks.find((r) => r.minPoints === tick)?.shortName);
    }
  });
});

describe('pointsAxis', () => {
  test('clean steps covering the data', () => {
    const axis = pointsAxis(2660, 3055, { maxTicks: 6 });
    expect(axis.kind).toBe('points');
    expect(axis.labelsBandAbove).toBe(false);
    expect(axis.domain).toEqual([2600, 3100]);
    expect(axis.ticks).toEqual([2600, 2700, 2800, 2900, 3000, 3100]);
    expect(axis.label(3000)).toBe('3,000');
  });

  test('a single value still gets a range', () => {
    const axis = pointsAxis(50, 50);
    expect(axis.domain[0]).toBeLessThan(50);
    expect(axis.domain[1]).toBeGreaterThan(50);
  });
});

const summary = (id: string, startedAt: string, points: number | null, playlistId = 'ladder'): MatchSummary => ({
  id: id as MatchId,
  origin: 'provider',
  gameMatchId: null,
  playlistId: playlistId as PlaylistId,
  mapId: null,
  seasonId: 'S1' as SeasonId,
  startedAt: startedAt as IsoDateTime,
  durationSec: null,
  result: 'win',
  score: { own: 4, opponent: 2 },
  rankChange: points === null ? null : { after: { points, rankId: null }, delta: 20 },
  kills: 1,
  deaths: 1,
  assists: null,
  headshotPct: null,
  hasDetail: true,
});

describe('pointsSeries and sessionStarts', () => {
  // Match history comes newest first.
  const history = [
    summary('m4', '2026-11-10T20:00:00.000Z', 1340),
    summary('m3', '2026-11-10T19:30:00.000Z', null, 'quick'),
    summary('m2', '2026-11-10T19:00:00.000Z', 1320),
    summary('m1', '2026-11-09T10:00:00.000Z', 1300),
    summary('m0', '2026-11-09T09:00:00.000Z', 1280, 'plain'),
  ];

  test('oldest first, only rows with a points change, optionally filtered', () => {
    expect(pointsSeries(history).map((d) => d.matchId)).toEqual(['m0', 'm1', 'm2', 'm4']);
    const ladderOnly = pointsSeries(history, (m) => m.playlistId === 'ladder');
    expect(ladderOnly.map((d) => [d.matchId, d.points, d.delta])).toEqual([
      ['m1', 1300, 20],
      ['m2', 1320, 20],
      ['m4', 1340, 20],
    ]);
  });

  test('a new session starts after a gap of more than 3 hours', () => {
    const series = pointsSeries(history);
    expect(sessionStarts(series)).toEqual([2]);
    expect(sessionStarts(series, 30 * 60_000)).toEqual([1, 2, 3]);
    expect(sessionStarts([])).toEqual([]);
  });
});
