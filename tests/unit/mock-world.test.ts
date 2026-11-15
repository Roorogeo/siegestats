import { describe, expect, test } from 'vitest';
import { createManualClock } from '@core/memory/clock';
import { generateWorld, matchDetail, matchSummary, PLACEMENT_MATCHES } from '@core/stats/mock/generate-world';
import { createMockProvider, MOCK_SEED } from '@core/stats/mock/mock-provider';
import { DENIED_HANDLES, isDeniedHandle } from '@core/stats/mock/names';
import type { MockWorld } from '@core/stats/mock/world';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { MatchDetail, MatchSummary } from '@shared/types/match';
import type { IsoDateTime } from '@shared/types/primitives';
import type { PlayerKey, PlayerRef } from '@shared/types/player';
import { createRandom } from '@shared/util/random';
import { kd } from '@shared/util/stats';
import { toMs } from '@shared/util/time';

const NOW = '2026-11-15T12:00:00.000Z' as IsoDateTime;
const game = createGameIndex(loadBundledGameConfig());
const clock = createManualClock(NOW);
const provider = createMockProvider({ game, clock, seed: MOCK_SEED });
const world = provider.world();
const keyOf = (p: PlayerKey): PlayerKey => ({ platform: p.platform, id: p.id });

/** Everything a screen can see, as one string: equal strings = byte-identical worlds. */
function fingerprint(w: MockWorld): string {
  return JSON.stringify({
    accounts: w.accounts.map((a) => [a.ref, a.linked, a.legendRegionId, a.partyId, a.person.level]),
    matches: w.matches.map((m) => matchDetail(game, m)),
    summaries: [...w.participations.values()].map((list) => list.map(matchSummary)),
    seasons: [...w.seasonRecords.entries()],
  });
}

async function allMatches(player: PlayerKey, filter: Partial<{ playlistIds: string[] | 'all'; period: unknown }> = {}): Promise<MatchSummary[]> {
  const out: MatchSummary[] = [];
  let cursor: string | null = null;
  do {
    const page = await provider.getMatches({
      player: keyOf(player),
      playlistIds: (filter.playlistIds ?? 'all') as never,
      mapId: 'all',
      period: (filter.period ?? 'all') as never,
      cursor,
      limit: 100,
    });
    out.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

const samplePlayers = (n: number): PlayerRef[] => {
  const rng = createRandom('consistency-sample');
  return rng.shuffle(world.accounts).slice(0, n).map((a) => a.ref);
};

describe('generator determinism', () => {
  test('the same seed and the same clock give a byte-identical world; another seed a different one', () => {
    const again = generateWorld({ seed: MOCK_SEED, now: NOW, game });
    expect(fingerprint(again)).toBe(fingerprint(world));
    const other = generateWorld({ seed: MOCK_SEED + 1, now: NOW, game });
    expect(fingerprint(other)).not.toBe(fingerprint(world));
  });

  test('accounts depend on the seed only, so pinned demo accounts survive a later launch', () => {
    const later = generateWorld({ seed: MOCK_SEED, now: '2027-02-03T08:00:00.000Z' as IsoDateTime, game });
    expect(later.accounts.map((a) => a.ref)).toEqual(world.accounts.map((a) => a.ref));
  });

  test('generates in well under a second, lazily on the first call', () => {
    let reads = 0;
    const counting = { now: () => { reads += 1; return NOW; }, sleep: async () => undefined };
    const lazy = createMockProvider({ game, clock: counting });
    expect(reads).toBe(0);
    const start = performance.now();
    lazy.world();
    expect(performance.now() - start).toBeLessThan(1000);
    lazy.world();
    expect(reads).toBe(1);
  });

  test('a clock outside the config still gets a world: the open last season, else the first', () => {
    const future = generateWorld({ seed: 1, now: '2031-06-01T00:00:00.000Z' as IsoDateTime, game });
    expect(future.currentSeasonId).toBe('Y11S4');
    expect(new Set(future.matches.map((m) => m.season.id))).toEqual(new Set(['Y11S4']));
    const past = generateWorld({ seed: 1, now: '2019-06-01T00:00:00.000Z' as IsoDateTime, game });
    expect(past.currentSeasonId).toBe('Y7S4');
    expect(past.matches.length).toBeGreaterThan(2500);
  });
});

describe('the generated population', () => {
  test('about 300 accounts, ~3,000 matches, a believable platform split, levels 20-400', () => {
    expect(world.accounts).toHaveLength(300);
    expect(world.matches.length).toBeGreaterThan(2900);
    const pc = world.accounts.filter((a) => a.ref.platform === 'pc').length;
    expect(pc).toBeGreaterThan(120);
    expect(pc).toBeLessThan(200);
    for (const a of world.accounts) {
      expect(a.person.level).toBeGreaterThanOrEqual(20);
      expect(a.person.level).toBeLessThanOrEqual(400);
      expect(a.ref.avatarUrl).toBeNull();
    }
  });

  test('invented handles: unique per platform, 3-15 characters, never a denied real name', () => {
    expect(DENIED_HANDLES).toContain('beaulo');
    expect(isDeniedHandle('Beaulo')).toBe(true);
    for (const platform of ['pc', 'psn', 'xbl'] as const) {
      const names = world.accounts.filter((a) => a.ref.platform === platform).map((a) => a.ref.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
    for (const a of world.accounts) {
      expect(isDeniedHandle(a.ref.name), a.ref.name).toBe(false);
      expect(a.ref.name.length).toBeGreaterThanOrEqual(3);
      expect(a.ref.name.length).toBeLessThanOrEqual(15);
    }
  });

  test('linked accounts are asserted pairs on different platforms, symmetric, 10-15% of people', async () => {
    const linked = world.accounts.filter((a) => a.linked.length > 0);
    const people = new Set(world.accounts.map((a) => a.person.index)).size;
    const share = linked.length / 2 / people;
    expect(share).toBeGreaterThanOrEqual(0.08);
    expect(share).toBeLessThanOrEqual(0.17);
    for (const a of linked) {
      const profile = await provider.getProfile(keyOf(a.ref));
      expect(profile.linkedAccounts?.length).toBe(1);
      const other = profile.linkedAccounts?.[0];
      expect(other?.platform).not.toBe(a.ref.platform);
      const back = await provider.getProfile(keyOf(other as PlayerRef));
      expect(back.linkedAccounts?.map((r) => r.id)).toEqual([a.ref.id]);
      expect(back.level).toBe(profile.level); // level is account-wide (cross-progression)
    }
    // Unlinked accounts say so explicitly: the source exposes links and there are none.
    const plain = world.accounts.find((a) => a.linked.length === 0);
    expect((await provider.getProfile(keyOf(plain?.ref as PlayerRef))).linkedAccounts).toEqual([]);
  });

  test('equal names on different platforms are not assumed to be one person', () => {
    const pairs = world.accounts.flatMap((a) =>
      world.accounts.filter((b) => b.key !== a.key && b.ref.name === a.ref.name && b.ref.platform !== a.ref.platform && !a.linked.includes(b.key)),
    );
    expect(pairs.length).toBeGreaterThan(0);
  });
});

describe('every number adds up', () => {
  const sample = samplePlayers(20);

  test('season aggregates equal the sum of the listed matches (overall and per playlist)', async () => {
    for (const ref of sample) {
      const seasons = await provider.getSeasons(keyOf(ref));
      for (const record of seasons) {
        const matches = await allMatches(ref, { period: { kind: 'season', seasonId: record.seasonId } });
        const fromMatches = world.seasons.get(`${ref.platform}:${ref.id}`)?.get(record.seasonId)?.fromMatches;
        if (!fromMatches) {
          // Summary-only seasons (before the window) list no matches, and are consistent within themselves.
          expect(matches).toEqual([]);
          const sum = (k: 'matches' | 'wins' | 'kills' | 'deaths') => record.byPlaylist.reduce((s, p) => s + p[k], 0);
          expect(sum('matches')).toBe(record.overall.matches);
          expect(sum('wins')).toBe(record.overall.wins);
          expect(sum('kills')).toBe(record.overall.kills);
          for (const p of record.byPlaylist) {
            if (p.standing?.rank && p.standing.peak) expect(p.standing.peak.points).toBeGreaterThanOrEqual(p.standing.rank.points);
          }
          if (record.bestAttacker) expect(record.bestAttacker.rounds).toBeLessThanOrEqual(record.overall.rounds ?? 0);
          continue;
        }
        const total = (list: MatchSummary[]) => ({
          matches: list.length,
          wins: list.filter((m) => m.result === 'win').length,
          losses: list.filter((m) => m.result === 'loss').length,
          kills: list.reduce((s, m) => s + m.kills, 0),
          deaths: list.reduce((s, m) => s + m.deaths, 0),
          assists: list.reduce((s, m) => s + (m.assists ?? 0), 0),
        });
        expect(record.overall).toMatchObject(total(matches));
        const headshots = matches.reduce((s, m) => s + (m.headshotPct ?? 0) * m.kills, 0);
        expect(record.overall.headshotPct ?? 0).toBeCloseTo(headshots / Math.max(1, record.overall.kills), 9);
        for (const p of record.byPlaylist) {
          expect(p).toMatchObject(total(matches.filter((m) => m.playlistId === p.playlistId)));
        }
      }
    }
  });

  test('damage per round and rounds equal the sum over the match details', async () => {
    for (const ref of sample.slice(0, 5)) {
      const profile = await provider.getProfile(keyOf(ref));
      const matches = await allMatches(ref, { period: { kind: 'season', seasonId: profile.currentSeason.seasonId } });
      let damage = 0;
      let rounds = 0;
      for (const m of matches) {
        const detail = await provider.getMatch(m.id);
        const me = detail.teams.flatMap((t) => t.players).find((p) => p.player?.id === ref.id);
        damage += me?.damage ?? 0;
        rounds += detail.rounds?.length ?? 0;
      }
      expect(profile.currentSeason.overall.rounds).toBe(rounds);
      if (rounds > 0) expect(profile.currentSeason.overall.damagePerRound ?? 0).toBeCloseTo(damage / rounds, 9);
    }
  });

  test('in every match: a team kills exactly the other team deaths, scores match the rounds, attack picks are attackers', () => {
    for (const m of world.matches) {
      const d: MatchDetail = matchDetail(game, m);
      const [blue, orange] = d.teams;
      const sum = (t: typeof blue, k: 'kills' | 'deaths') => t.players.reduce((s, p) => s + p[k], 0);
      expect(sum(blue, 'kills')).toBe(sum(orange, 'deaths'));
      expect(sum(orange, 'kills')).toBe(sum(blue, 'deaths'));
      expect(blue.players).toHaveLength(5);
      expect(orange.players).toHaveLength(5);
      const rounds = d.rounds ?? [];
      expect(rounds.filter((r) => r.winner === 'blue').length).toBe(blue.score);
      expect(rounds.filter((r) => r.winner === 'orange').length).toBe(orange.score);
      expect(blue.result).toBe(blue.score > orange.score ? 'win' : 'loss');
      const teamOf = new Map(d.teams.flatMap((t) => t.players.map((p) => [p.slot, t.id] as const)));
      for (const p of [...blue.players, ...orange.players]) expect(p.deaths).toBeLessThanOrEqual(rounds.length);
      for (const round of rounds) {
        expect(round.picks).toHaveLength(10);
        const seen = { blue: new Set<string>(), orange: new Set<string>() };
        for (const pick of round.picks) {
          const team = teamOf.get(pick.slot);
          expect(team).toBeDefined();
          const op = pick.operatorId ? game.operator(pick.operatorId) : null;
          expect(op).not.toBeNull();
          expect(op?.side).toBe(team === round.attackers ? 'attack' : 'defense');
          // No two teammates on the same operator in one round.
          expect(seen[team ?? 'blue'].has(pick.operatorId ?? '')).toBe(false);
          seen[team ?? 'blue'].add(pick.operatorId ?? '');
        }
      }
      const players = [...blue.players, ...orange.players];
      for (const p of players) {
        const op = rounds.map((r) => r.picks.find((x) => x.slot === p.slot)?.operatorId);
        expect(new Set(p.operatorIds)).toEqual(new Set(op));
      }
    }
  });

  test('matches stay within one pool (PC or console) and nobody plays two matches at once', () => {
    const busy = new Map<string, number>();
    for (const m of world.matches) {
      const families = new Set(m.slots.map((s) => s.account.family));
      expect(families.size).toBe(1);
      for (const s of m.slots) {
        expect(m.startMs).toBeGreaterThanOrEqual(busy.get(s.account.key) ?? 0);
        busy.set(s.account.key, m.startMs + m.durationSec * 1000);
      }
      expect(m.startMs + m.durationSec * 1000).toBeLessThanOrEqual(toMs(NOW));
    }
  });

  test('Ranked: placements first, then RP after = ladder rank of the new points, and the changes chain', () => {
    for (const ref of samplePlayers(60)) {
      const ranked = (world.participations.get(`${ref.platform}:${ref.id}`) ?? []).filter((p) => p.match.playlist.points === 'ladder');
      const bySeason = new Map<string, typeof ranked>();
      for (const p of ranked) bySeason.set(p.match.season.id, [...(bySeason.get(p.match.season.id) ?? []), p]);
      for (const [seasonId, list] of bySeason) {
        const system = game.rankSystemFor(seasonId);
        let previous: number | null = null;
        list.forEach((p, i) => {
          const change = p.match.slots[p.slot]?.rankChange;
          expect(change).toBeTruthy();
          if (!change) return;
          if (previous !== null) expect(change.after.points - change.delta).toBe(previous);
          previous = change.after.points;
          if (i < PLACEMENT_MATCHES - 1) expect(change.after.rankId).toBeNull();
          else expect(change.after.rankId).toBe(game.rankForPoints(system?.id ?? '', change.after.points)?.id);
        });
      }
    }
  });

  test('peak per season is the highest placed RP of that season', async () => {
    for (const ref of sample) {
      const profile = await provider.getProfile(keyOf(ref));
      const standing = profile.currentSeason.byPlaylist.find((p) => p.playlistId === 'ranked')?.standing;
      const matches = (await allMatches(ref, { playlistIds: ['ranked'], period: { kind: 'season', seasonId: profile.currentSeason.seasonId } })).reverse();
      if (matches.length < PLACEMENT_MATCHES) {
        expect(standing?.rank ?? null).toBeNull();
        continue;
      }
      const placed = matches.slice(PLACEMENT_MATCHES - 1).map((m) => m.rankChange?.after.points ?? 0);
      expect(standing?.peak?.points).toBe(Math.max(...placed));
      expect(standing?.rank?.points).toBe(placed.at(-1));
    }
  });

  test('Legend Division: plain points with no division, a region, and a regional position', () => {
    const legend = world.accounts.filter((a) => a.legendRegionId !== null);
    expect(legend.length).toBeGreaterThanOrEqual(24);
    expect(legend.length).toBeLessThanOrEqual(48);
    const legendMatches = world.matches.filter((m) => m.playlist.kind === 'legend');
    expect(legendMatches.length).toBeGreaterThan(10);
    for (const m of legendMatches) {
      expect(m.season.id).toBe('Y11S3');
      for (const s of m.slots) {
        expect(s.account.legendRegionId).not.toBeNull();
        expect(s.rankChange?.after.rankId).toBeNull();
      }
    }
  });

  test('encounters agree with the shared matches; friend groups show up as regular teammates', async () => {
    let regularTeammates = 0;
    const counts: number[] = [];
    for (const ref of sample) {
      const encounters = await provider.getEncounters(keyOf(ref));
      counts.push(encounters.length);
      const mine = await allMatches(ref);
      const details = new Map<string, MatchDetail>();
      for (const m of mine) details.set(m.id, await provider.getMatch(m.id));
      for (const e of encounters) {
        expect(e.matches).toBeGreaterThanOrEqual(2);
        const shared = mine.filter((m) => details.get(m.id)?.teams.some((t) => t.players.some((p) => p.player?.id === e.player.id)));
        expect(shared.length).toBe(e.matches);
        expect(e.asTeammate + e.asOpponent).toBe(e.matches);
        const teammate = shared.filter((m) => {
          const d = details.get(m.id);
          const myTeam = d?.teams.find((t) => t.players.some((p) => p.player?.id === ref.id));
          return myTeam?.players.some((p) => p.player?.id === e.player.id);
        });
        expect(teammate.length).toBe(e.asTeammate);
        expect(shared.filter((m) => m.result === 'win').length).toBe(e.wins);
        expect(e.lastMatchId).toBe(shared[0]?.id);
        expect(e.lastMetAt).toBe(shared[0]?.startedAt);
        if (e.asTeammate >= 5 && e.asOpponent === 0) regularTeammates += 1;
      }
    }
    counts.sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)] ?? 0;
    expect(median).toBeGreaterThanOrEqual(10); // "a few dozen" per player
    expect(regularTeammates).toBeGreaterThan(0);
  });

  test('leaderboard rows agree with the players profiles', async () => {
    for (const metric of ['points', 'kd', 'winRate', 'level'] as const) {
      const board = await provider.getLeaderboard({
        playlistId: 'ranked' as never, metric, scope: 'global', seasonId: 'current', regionId: 'all', page: 1, pageSize: 25,
      });
      expect(board.entries.length).toBeGreaterThan(0);
      for (const row of board.entries) {
        const profile = await provider.getProfile(keyOf(row.player));
        const ranked = profile.currentSeason.byPlaylist.find((p) => p.playlistId === 'ranked');
        expect(row.level).toBe(profile.level);
        expect(row.rank).toEqual(ranked?.standing?.rank ?? null);
        if (metric !== 'level') {
          expect(row.kd).toBe(kd(ranked?.kills ?? 0, ranked?.deaths ?? 0));
          if (metric === 'points') expect(row.value).toBe(ranked?.standing?.rank?.points);
          if (metric === 'kd') {
            expect(row.value).toBe(row.kd);
            expect(ranked?.matches).toBeGreaterThanOrEqual(20);
          }
        } else {
          expect(row.value).toBe(profile.level);
        }
      }
      const values = board.entries.map((e) => e.value);
      expect([...values].sort((a, b) => b - a)).toEqual(values);
    }
  });
});
