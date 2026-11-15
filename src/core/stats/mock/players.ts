import type { GameIndex } from '@shared/game-config';
import type { OperatorId, Platform, PlatformFamily, PlayerId, RegionId, Side } from '@shared/types/primitives';
import type { Random } from '@shared/util/random';
import { candidateHandle, isDeniedHandle, variantHandle } from './names';
import type { MockAccount, MockPerson, OperatorPool } from './world';

export const MOCK_ACCOUNT_COUNT = 300;
/** Share of people with a second, linked account on another platform. */
const LINKED_SHARE = 0.14;
const PLATFORM_WEIGHTS: readonly (readonly [Platform, number])[] = [['pc', 55], ['psn', 28], ['xbl', 17]];
/** Legend Division: the best main accounts of each pool. A console edition is not confirmed upstream; the mock has both. */
const LEGEND_PER_FAMILY: Record<PlatformFamily, number> = { pc: 22, console: 14 };

export const familyOf = (platform: Platform): PlatformFamily => (platform === 'pc' ? 'pc' : 'console');
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function uuid(rng: Random): PlayerId {
  const hex = (n: number): string => Array.from({ length: n }, () => rng.int(0, 15).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${rng.pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}` as PlayerId;
}

function operatorWeights(rng: Random, game: GameIndex, side: Side): OperatorPool {
  const ids: OperatorId[] = game.operatorsBySide(side).map((o) => o.id);
  const favourites = rng.shuffle(ids).slice(0, 5);
  const boost = [12, 7, 5, 3.5, 2.5];
  return {
    ids,
    weights: ids.map((id) => {
      const at = favourites.indexOf(id);
      return at >= 0 ? (boost[at] ?? 1) : 0.35;
    }),
  };
}

function person(rng: Random, game: GameIndex, index: number): MockPerson {
  const skill = clamp(rng.normal(0, 1), -2.8, 3.2);
  const activity = clamp(Math.exp(rng.normal(0, 0.6)), 0.25, 4);
  const roll = rng.next();
  // Most play throughout; some stopped a while ago, some only started recently (so short periods can be empty).
  const activeFrom = roll < 0.08 ? rng.float(0.3, 0.8) : 0;
  const activeUntil = roll > 0.9 ? rng.float(Math.max(activeFrom + 0.15, 0.4), 0.93) : 1;
  const seasons = game.config.seasons;
  const first = seasons[0]?.number ?? 1;
  const last = seasons[seasons.length - 1]?.number ?? first;
  return {
    index,
    skill,
    activity,
    headshotRate: clamp(rng.normal(0.44, 0.07) + skill * 0.025, 0.22, 0.68),
    level: Math.round(clamp(rng.normal(150, 75) + skill * 35 + activity * 20, 20, 400)),
    activeFrom,
    activeUntil,
    firstSeasonNumber: rng.chance(0.55) ? first : rng.int(first, Math.max(first, last - 2)),
    operatorWeights: { attack: operatorWeights(rng, game, 'attack'), defense: operatorWeights(rng, game, 'defense') },
  };
}

/**
 * About 300 accounts belonging to about 265 people: invented handles unique per platform, a believable platform
 * split, levels 20-400, a hidden skill, recurring friend groups of 2-5, and ~12% of people with a second account
 * on another platform that the source declares linked. A few unrelated people share a handle on different
 * platforms on purpose: the app must never treat equal names as the same person.
 * Depends on the seed and the config only, never on the clock, so pinned accounts stay valid between launches.
 */
export function generateAccounts(rng: Random, game: GameIndex): MockAccount[] {
  const accounts: MockAccount[] = [];
  const taken: Record<Platform, Set<string>> = { pc: new Set(), psn: new Set(), xbl: new Set() };
  const free = (platform: Platform, handle: string): boolean =>
    handle.length >= 3 && !taken[platform].has(handle.toLowerCase()) && !isDeniedHandle(handle);
  const freshHandle = (platform: Platform): string => {
    // Now and then reuse a handle that someone else holds on another platform: same name, different person.
    if (accounts.length > 20 && rng.chance(0.02)) {
      const other = rng.pick(accounts);
      if (other.ref.platform !== platform && free(platform, other.ref.name)) return other.ref.name;
    }
    for (;;) {
      const handle = candidateHandle(rng);
      if (free(platform, handle)) return handle;
    }
  };
  const add = (p: MockPerson, platform: Platform, name: string, activityShare: number): MockAccount => {
    taken[platform].add(name.toLowerCase());
    const id = uuid(rng);
    const account: MockAccount = {
      index: accounts.length,
      key: `${platform}:${id}`,
      ref: { platform, id, name, avatarUrl: null },
      family: familyOf(platform),
      person: p,
      activityShare,
      legendRegionId: null,
      partyId: null,
      linked: [],
    };
    accounts.push(account);
    return account;
  };

  for (let index = 0; accounts.length < MOCK_ACCOUNT_COUNT; index += 1) {
    const p = person(rng, game, index);
    const platform = rng.weighted(PLATFORM_WEIGHTS);
    const main = add(p, platform, freshHandle(platform), 1);
    if (accounts.length < MOCK_ACCOUNT_COUNT && rng.chance(LINKED_SHARE)) {
      const second: Platform =
        platform === 'pc' ? rng.pick<Platform>(['psn', 'xbl']) : rng.chance(0.6) ? 'pc' : platform === 'psn' ? 'xbl' : 'psn';
      const roll = rng.next();
      let name = roll < 0.5 ? main.ref.name : roll < 0.8 ? variantHandle(rng, main.ref.name, second) : freshHandle(second);
      if (!free(second, name)) name = freshHandle(second);
      const alt = add(p, second, name, rng.float(0.2, 0.5));
      main.linked.push(alt.key);
      alt.linked.push(main.key);
    }
  }

  assignParties(rng, accounts);
  assignLegend(rng, game, accounts);
  return accounts;
}

/** Stable friend groups of 2-5 within one pool, of similar (not equal) skill: the people a player keeps meeting as teammates. */
function assignParties(rng: Random, accounts: MockAccount[]): void {
  let partyId = 0;
  for (const family of ['pc', 'console'] as const) {
    const pool = accounts
      .filter((a) => a.family === family)
      .map((a) => ({ a, sort: a.person.skill + rng.normal(0, 0.45) }))
      .sort((x, y) => x.sort - y.sort)
      .map((x) => x.a);
    for (let i = 0; i < pool.length; ) {
      if (!rng.chance(0.3)) {
        i += 1;
        continue;
      }
      const size = rng.weighted<number>([[2, 4], [3, 3], [4, 2], [5, 1]]);
      const members = pool.slice(i, i + size);
      if (members.length >= 2) {
        for (const m of members) m.partyId = partyId;
        partyId += 1;
      }
      i += size;
    }
  }
}

function assignLegend(rng: Random, game: GameIndex, accounts: MockAccount[]): void {
  const legend = game.config.playlists.find((p) => p.kind === 'legend' && p.leaderboard !== null);
  const regionIds: RegionId[] = legend?.leaderboard?.regionIds ?? [];
  if (!legend || regionIds.length === 0) return;
  // Bigger regions get more players; the weights follow the order the config lists them in, nothing more.
  const weights = regionIds.map((id, i) => [id, 3 + ((i * 7) % 5)] as const);
  for (const family of ['pc', 'console'] as const) {
    accounts
      .filter((a) => a.family === family && a.activityShare === 1)
      .sort((x, y) => y.person.skill - x.person.skill)
      .slice(0, LEGEND_PER_FAMILY[family])
      .forEach((a) => {
        a.legendRegionId = rng.weighted(weights);
      });
  }
}
