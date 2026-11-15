import { beforeAll, describe, expect, test } from 'vitest';
import { createManualClock } from '@core/memory/clock';
import { createMockProvider } from '@core/stats/mock/mock-provider';
import { buildMatchView, buildRounds, byScore, teamTotals, type ExtraRound } from '@renderer/features/match/match-view';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { PlaylistDef } from '@shared/types/game-config';
import type { MatchDetail, MatchPlayer, MatchRound } from '@shared/types/match';
import type { IsoDateTime, MatchId, PlayerId, PlaylistId, SeasonId, TeamId } from '@shared/types/primitives';

const NOW = '2026-11-15T12:00:00.000Z' as IsoDateTime;
const game = createGameIndex(loadBundledGameConfig());
const provider = createMockProvider({ game, clock: createManualClock(NOW) });
const world = provider.world();

const player = (slot: number, over: Partial<MatchPlayer> = {}): MatchPlayer => ({
  slot,
  name: `P${slot}`,
  player: { platform: 'pc', id: `p-${slot}` as PlayerId, name: `P${slot}`, avatarUrl: null },
  kills: 0,
  deaths: 0,
  assists: 0,
  headshotPct: null,
  damage: 0,
  score: 0,
  operatorIds: [],
  ...over,
});

/** Rounds from a winners string, "BBOO" = blue, blue, orange, orange; "?" = unknown winner. */
const rounds = (winners: string): MatchRound[] =>
  [...winners].map((w, i) => ({
    number: i + 1,
    winner: w === 'B' ? 'blue' : w === 'O' ? 'orange' : null,
    attackers: null,
    outcome: null,
    picks: [],
  }));

const match = (playlistId: string | null, winners: string | null): MatchDetail => {
  const list = winners === null ? null : rounds(winners);
  const blue = list?.filter((r) => r.winner === 'blue').length ?? 0;
  const orange = list?.filter((r) => r.winner === 'orange').length ?? 0;
  return {
    id: 'm-test' as MatchId,
    gameMatchId: null,
    origin: 'provider',
    playlistId: playlistId as PlaylistId | null,
    mapId: null,
    seasonId: 'Y11S3' as SeasonId,
    startedAt: NOW,
    durationSec: null,
    teams: [
      { id: 'blue', score: blue, result: blue > orange ? 'win' : blue < orange ? 'loss' : 'draw', players: [player(0), player(1)] },
      { id: 'orange', score: orange, result: orange > blue ? 'win' : orange < blue ? 'loss' : 'draw', players: [player(5), player(6)] },
    ],
    recorderSlot: null,
    rounds: list,
  };
};

const scores = (list: ReturnType<typeof buildRounds>) => list?.map((r) => r.score);
const extras = (list: ReturnType<typeof buildRounds>) => list?.map((r) => r.extra);

/** The config's rule for a playlist, read straight from PlaylistDef (independent of match-view). */
function ruleOf(playlist: PlaylistDef | null): { at: number; extra: ExtraRound } | null {
  if (!playlist) return null;
  if (playlist.overtime) return { at: playlist.overtime.at, extra: 'overtime' };
  if (playlist.decidingRoundAt !== null) return { at: playlist.decidingRoundAt, extra: 'decider' };
  return null;
}

describe('teamTotals', () => {
  test('sums kills, deaths, assists, damage and score; K/D is total kills over total deaths', () => {
    const totals = teamTotals([
      player(0, { kills: 4, deaths: 2, assists: 1, damage: 500, score: 300 }),
      player(1, { kills: 6, deaths: 3, assists: 2, damage: 700, score: 450 }),
    ]);
    expect(totals).toMatchObject({ kills: 10, deaths: 5, assists: 3, damage: 1200, score: 750, kd: 2 });
  });

  test('headshot % is rebuilt from each player\'s ratio and kills; a player without kills adds nothing', () => {
    const totals = teamTotals([
      player(0, { kills: 4, headshotPct: 0.5 }),
      player(1, { kills: 6, headshotPct: 2 / 6 }),
      player(2, { kills: 0, headshotPct: null }),
    ]);
    expect(totals.headshotPct).toBeCloseTo(0.4, 10);
  });

  test('an unknown value makes that total unknown rather than a partial sum', () => {
    const totals = teamTotals([player(0, { kills: 3, deaths: 1, headshotPct: null, assists: null }), player(1, { kills: 1, damage: null, score: null })]);
    expect(totals).toMatchObject({ kills: 4, deaths: 1, assists: null, headshotPct: null, damage: null, score: null });
  });

  test('no kills and no deaths: K/D and headshot % unknown', () => {
    expect(teamTotals([player(0), player(1)])).toMatchObject({ kills: 0, deaths: 0, kd: null, headshotPct: null });
  });
});

describe('buildRounds', () => {
  test('running score with the first-listed team first, rounds in order whatever the source order', () => {
    const m = match('quick-match', 'BOOB');
    const reversed = { ...m, rounds: [...(m.rounds ?? [])].reverse() };
    expect(scores(buildRounds(reversed, 'blue', game))).toEqual([[1, 0], [1, 1], [1, 2], [2, 2]]);
    expect(scores(buildRounds(m, 'orange', game))).toEqual([[0, 1], [1, 1], [2, 1], [2, 2]]);
    expect(buildRounds(m, 'blue', game)?.map((r) => r.number)).toEqual([1, 2, 3, 4]);
  });

  test('from the first round with an unknown winner on, the score is unknown', () => {
    expect(scores(buildRounds(match('quick-match', 'B?OB'), 'blue', game))).toEqual([[1, 0], null, null, null]);
  });

  test('no round data stays null', () => {
    expect(buildRounds(match('ranked', null), 'blue', game)).toBeNull();
  });

  test('Ranked and Legend Division: every round after the overtime tie is overtime', () => {
    for (const id of ['ranked', 'legend-division']) {
      const at = game.playlist(id)?.overtime?.at ?? -1;
      expect(at).toBe(3);
      // 3-3 after round 6, then 2 overtime rounds: 5-3.
      expect(extras(buildRounds(match(id, 'BOBOBOBB'), 'blue', game))).toEqual([null, null, null, null, null, null, 'overtime', 'overtime']);
      // 5-4: three overtime rounds.
      expect(extras(buildRounds(match(id, 'BOBOBOOBB'), 'blue', game))?.filter((e) => e === 'overtime')).toHaveLength(3);
      // 4-2 in regulation: none.
      expect(extras(buildRounds(match(id, 'BBOBOB'), 'blue', game))?.every((e) => e === null)).toBe(true);
    }
  });

  test('Standard: one deciding round after a 3-3 tie; Quick Match and unknown playlists mark nothing', () => {
    expect(game.playlist('standard')?.decidingRoundAt).toBe(3);
    expect(extras(buildRounds(match('standard', 'BOBOBOB'), 'blue', game))).toEqual([null, null, null, null, null, null, 'decider']);
    expect(extras(buildRounds(match('quick-match', 'BOBOBOB'), 'blue', game))?.every((e) => e === null)).toBe(true);
    expect(extras(buildRounds(match(null, 'BOBOBOBB'), 'blue', game))?.every((e) => e === null)).toBe(true);
    expect(extras(buildRounds(match('not-in-config', 'BOBOBOBB'), 'blue', game))?.every((e) => e === null)).toBe(true);
  });

  test('a tie reached after an unknown winner is not known, so nothing is marked', () => {
    expect(extras(buildRounds(match('ranked', 'BOBOB?BB'), 'blue', game))?.every((e) => e === null)).toBe(true);
  });

  test('picks become a slot -> operator map', () => {
    const m = match('quick-match', 'B');
    const first = m.rounds?.[0];
    if (!first) throw new Error('no round');
    first.picks = [{ slot: 0, operatorId: null }];
    expect([...(buildRounds(m, 'blue', game)?.[0]?.picks ?? new Map())]).toEqual([[0, null]]);
  });
});

describe('every mock match', () => {
  const details: MatchDetail[] = [];
  beforeAll(async () => {
    for (const m of world.matches) details.push(await provider.getMatch(m.id));
  });

  test('running score, final score and overtime / decider marks agree with the config\'s playlist rules', () => {
    expect(details.length).toBeGreaterThan(1000);
    const seen = new Map<string, number>();
    for (const detail of details) {
      // Seen from a player of the orange team, so the first-listed team is not always blue.
      const orange = detail.teams.find((t) => t.id === 'orange')?.players.find((p) => p.player !== null)?.player ?? null;
      for (const pov of [null, orange]) {
        const view = buildMatchView(detail, pov, game);
        const firstId: TeamId = view.teams[0].id;
        expect(firstId).toBe(pov ? 'orange' : 'blue');
        const list = view.rounds;
        if (list === null || detail.rounds === null) {
          expect(list).toBeNull();
          continue;
        }
        expect(list.map((r) => r.number)).toEqual(list.map((_, i) => i + 1));
        let own = 0;
        let opp = 0;
        let tieAfter: number | null = null;
        const rule = ruleOf(detail.playlistId === null ? null : game.playlist(detail.playlistId));
        for (const round of list) {
          expect(round.winner).not.toBeNull();
          if (round.winner === firstId) own += 1;
          else opp += 1;
          expect(round.score).toEqual([own, opp]);
          expect(round.extra).toBe(tieAfter !== null && round.number > tieAfter && rule ? rule.extra : null);
          if (rule && tieAfter === null && own === rule.at && opp === rule.at) tieAfter = round.number;
        }
        expect([own, opp]).toEqual([view.teams[0].team.score, view.teams[1].team.score]);
        if (pov !== null) continue;
        const extra = list.filter((r) => r.extra !== null).length;
        if (extra > 0) {
          const key = `${detail.playlistId}:${Math.max(own, opp)}-${Math.min(own, opp)}:${list.at(-1)?.extra}x${extra}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
    }
    // The rules are exercised, and only in the shapes the game has: overtime ends 5-3 (2 extra rounds) or 5-4
    // (3 extra), a Standard decider 4-3 (1 extra).
    expect([...seen.keys()].sort()).toEqual([
      'legend-division:5-3:overtimex2', 'legend-division:5-4:overtimex3', 'ranked:5-3:overtimex2', 'ranked:5-4:overtimex3',
      'standard:4-3:deciderx1',
    ]);
  });

  test('team totals add up the player rows of every match', () => {
    for (const detail of details) {
      for (const team of detail.teams) {
        const totals = teamTotals(team.players);
        expect(totals.kills).toBe(team.players.reduce((n, p) => n + p.kills, 0));
        expect(totals.deaths).toBe(team.players.reduce((n, p) => n + p.deaths, 0));
        if (totals.score !== null) expect(totals.score).toBe(team.players.reduce((n, p) => n + (p.score ?? 0), 0));
      }
    }
  });

  test('the point-of-view player is found, and their team listed first', () => {
    const detail = details[0];
    if (!detail) throw new Error('no match');
    const me = detail.teams[1].players.find((p) => p.player !== null);
    if (!me?.player) throw new Error('no player');
    const view = buildMatchView(detail, { platform: me.player.platform, id: me.player.id }, game);
    expect(view.povKnown).toBe(true);
    expect(view.povSlot).toBe(me.slot);
    expect(view.povPlayer?.slot).toBe(me.slot);
    expect(view.teams[0].id).toBe(detail.teams[1].id);
    expect(view.teams.map((t) => t.label)).toEqual(['Your team', 'Opponents']);
    const stranger = buildMatchView(detail, { platform: 'xbl', id: 'nobody' as PlayerId }, game);
    expect(stranger.povKnown).toBe(false);
    expect(stranger.teams.map((t) => t.label)).toEqual(['Blue', 'Orange']);
  });
});

describe('byScore', () => {
  test('highest score first, unknown scores last, ties in the source order; the input is untouched', () => {
    const list = [player(0, { score: 300 }), player(1, { score: null }), player(2, { score: 500 }), player(3, { score: 300 }), player(4, { score: null })];
    const before = list.map((p) => p.slot);
    expect(byScore(list).map((p) => p.slot)).toEqual([2, 0, 3, 1, 4]);
    expect(list.map((p) => p.slot)).toEqual(before);
  });
});
