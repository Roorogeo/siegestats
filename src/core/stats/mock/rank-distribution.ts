import type { RankSystemDef, SeasonDef } from '@shared/types/game-config';
import type { RankDistribution } from '@shared/types/leaderboard';
import type { IsoDateTime, LeaderboardScope, PlatformFamily, RankId } from '@shared/types/primitives';
import { createRandom } from '@shared/util/random';
import { DAY_MS, toMs } from '@shared/util/time';

/**
 * A synthetic ladder population for the rank-distribution chart (design question 26): hundreds of thousands
 * of ranked profiles, shaped like a real ladder (most players in the middle tiers, a long thin top), and
 * deterministic per seed, season and pool. It has nothing to do with the 300 generated players, whose share
 * would not show at this scale anyway. Global = PC + console, bucket by bucket.
 */

const POOL: Record<PlatformFamily, { size: number; mean: number; sd: number }> = {
  pc: { size: 520_000, mean: 2750, sd: 720 },
  console: { size: 410_000, mean: 2600, sd: 680 },
};

/** Share of a normal distribution between a and b. */
function normalMass(a: number, b: number, mean: number, sd: number): number {
  const cdf = (x: number): number => {
    if (x === Infinity) return 1;
    if (x === -Infinity) return 0;
    // Abramowitz-Stegun 7.1.26 approximation of erf, accurate to ~1e-7.
    const z = (x - mean) / (sd * Math.SQRT2);
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return 0.5 * (1 + Math.sign(z) * y);
  };
  return Math.max(0, cdf(b) - cdf(a));
}

function poolBuckets(seed: number, system: RankSystemDef, season: SeasonDef, family: PlatformFamily, nowMs: number): number[] {
  const rng = createRandom(`${seed}/distribution/${season.id}/${family}`);
  const pool = POOL[family];
  // A season still running has fewer ranked profiles yet; older seasons vary a little in size.
  const start = toMs(season.startsAt);
  const end = season.endsAt ? toMs(season.endsAt) : Infinity;
  const progress = nowMs < end ? Math.min(1, Math.max(0.05, (nowMs - start) / (90 * DAY_MS))) : 1;
  const size = pool.size * rng.float(0.85, 1.15) * (0.3 + 0.7 * progress);
  const mean = pool.mean + rng.normal(0, 60);
  const ranks = system.ranks;
  return ranks.map((rank, i) => {
    // The lowest division also holds everyone below it, the open top everyone above it.
    const lo = i === 0 ? -Infinity : rank.minPoints;
    const hi = rank.maxPoints === null ? Infinity : rank.maxPoints + 1;
    return Math.round(size * normalMass(lo, hi, mean, pool.sd) * rng.float(0.94, 1.06));
  });
}

export function rankDistribution(
  seed: number,
  system: RankSystemDef,
  season: SeasonDef,
  scope: LeaderboardScope,
  now: IsoDateTime,
  updatedAt: IsoDateTime,
): RankDistribution {
  const nowMs = toMs(now);
  const families: PlatformFamily[] = scope === 'global' ? ['pc', 'console'] : [scope];
  const counts = system.ranks.map(() => 0);
  for (const family of families) {
    poolBuckets(seed, system, season, family, nowMs).forEach((count, i) => {
      counts[i] = (counts[i] ?? 0) + count;
    });
  }
  const buckets = system.ranks.map((rank, i): { rankId: RankId; count: number } => ({ rankId: rank.id, count: counts[i] ?? 0 }));
  return { totalProfiles: buckets.reduce((sum, b) => sum + b.count, 0), buckets, updatedAt };
}
