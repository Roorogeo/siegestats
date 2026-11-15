import { describe, expect, test } from 'vitest';
import { createGameIndex, validateGameConfig } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import { color } from '@shared/theme';
import type { GameConfig } from '@shared/types/game-config';
import { jsonCopy } from '@shared/util/json';

const config = loadBundledGameConfig();
const game = createGameIndex(config);
const raw = (): Record<string, unknown> => jsonCopy(config) as unknown as Record<string, unknown>;

describe('the bundled game config', () => {
  test('validates, and validating it again changes nothing', () => {
    expect(validateGameConfig(jsonCopy(config))).toEqual(config);
    expect(config.schemaVersion).toBe(1);
    expect(game.season(config.currentSeasonId)?.id).toBe('Y11S3');
  });

  test('seasons Y7S4 (28) to Y11S4 (44), oldest first, each ending when the next starts', () => {
    const ids = config.seasons.map((s) => s.id);
    expect(ids[0]).toBe('Y7S4');
    expect(ids.at(-1)).toBe('Y11S4');
    expect(config.seasons.map((s) => s.number)).toEqual(Array.from({ length: 17 }, (_, i) => 28 + i));
    config.seasons.forEach((season, i) => {
      const next = config.seasons[i + 1];
      expect(season.endsAt).toBe(next ? next.startsAt : null);
    });
    expect(game.season('Y11S3')).toMatchObject({ name: 'Operation Split Fire', startsAt: '2026-09-01T00:00:00.000Z' });
  });

  test('every season maps to a rank system: Ranked 2.0 up to Y11S1, Ranked 3.0 from Y11S2', () => {
    for (const season of config.seasons) {
      const system = game.rankSystemFor(season.id);
      expect(system, season.id).not.toBeNull();
      expect(system?.id).toBe(season.number >= 42 ? 'ranked-3' : 'ranked-2');
    }
    expect(game.ranksOf('ranked-2')).toHaveLength(36); // 35 divisions + Champions
    expect(game.ranksOf('ranked-3')).toHaveLength(40);
  });

  test('ranks: unique ids across systems, contiguous 100-point divisions from 1000, open-ended top', () => {
    const allIds = config.rankSystems.flatMap((s) => s.ranks.map((r) => r.id));
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const system of config.rankSystems) {
      expect(system.ranks[0]?.minPoints).toBe(1000);
      system.ranks.forEach((rank, i) => {
        if (i < system.ranks.length - 1) expect(rank.maxPoints).toBe(rank.minPoints + 99);
        else expect(rank.maxPoints).toBeNull();
      });
      expect(system.tiers).toHaveLength(8);
    }
    expect(game.rank('r2.gold-3')).toMatchObject({ name: 'Gold III', shortName: 'G3', minPoints: 2700 });
    expect(game.rank('r3.champion-1')).toMatchObject({ name: 'Champion I', minPoints: 4900, maxPoints: null });
    expect(game.tierOf('r3.champion-1')?.name).toBe('Champion');
  });

  test('tier colours are theme-independent hex, distinct, and the badge text colour is readable', () => {
    const tiers = config.rankSystems[1]?.tiers ?? [];
    expect(new Set(tiers.map((t) => t.color)).size).toBe(8);
    for (const tier of tiers) {
      const text = color.readableTextOn(tier.color);
      expect(['#000000', '#FFFFFF']).toContain(text);
      expect(color.contrast(text, tier.color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('78 operators: 39 attackers and 39 defenders, unique ids and initials', () => {
    expect(config.operators).toHaveLength(78);
    expect(game.operatorsBySide('attack')).toHaveLength(39);
    expect(game.operatorsBySide('defense')).toHaveLength(39);
    expect(new Set(config.operators.map((o) => o.initials)).size).toBe(78);
    expect(new Set(config.operators.map((o) => o.color)).size).toBe(78);
    expect(game.operator('solid-snake')).toMatchObject({ name: 'Solid Snake', side: 'attack' });
    expect(game.operator('noor')).toMatchObject({ side: 'defense' });
  });

  test('maps, regions and playlists are present with unique initials', () => {
    expect(config.maps.length).toBeGreaterThanOrEqual(27);
    expect(new Set(config.maps.map((m) => m.initials)).size).toBe(config.maps.length);
    expect(config.regions.map((r) => r.id)).toEqual(['na', 'latam', 'emea', 'apac', 'oce']);
    expect(game.playlist('legend-division')).toMatchObject({ kind: 'legend', points: 'plain', firstSeasonId: 'Y11S3' });
    expect(game.playlist('legend-division')?.leaderboard?.regionIds).toHaveLength(5);
    expect(game.playlist('dual-front')?.lastSeasonId).toBe('Y11S1');
    expect(game.playlist('training')?.liveMatchSupported).toBe(false);
    expect(game.playlistsWithPoints().map((p) => p.id)).toEqual(['ranked', 'legend-division']);
    expect(game.playlistActiveIn('legend-division', 'Y11S2')).toBe(false);
    expect(game.playlistActiveIn('legend-division', 'Y11S3')).toBe(true);
    expect(game.playlistActiveIn('dual-front', 'Y11S2')).toBe(false);
  });

  test('round rules: overtime at 3-3 to 5 in Ranked and Legend Division, one deciding round at 3-3 in Standard', () => {
    for (const id of ['ranked', 'legend-division']) {
      expect(game.playlist(id)).toMatchObject({ overtime: { at: 3, roundsToWin: 5 }, decidingRoundAt: null });
    }
    expect(game.playlist('standard')).toMatchObject({ overtime: null, decidingRoundAt: 3 });
    for (const p of config.playlists) {
      if (!['ranked', 'legend', 'standard'].includes(p.kind)) expect(p, p.id).toMatchObject({ overtime: null, decidingRoundAt: null });
    }
  });

  test('release seasons and playlist kinds of operators and maps', () => {
    expect(game.operator('noor')?.firstSeasonId).toBe('Y11S3');
    expect(game.operator('solid-snake')?.firstSeasonId).toBe('Y11S1');
    expect(game.operator('ace')?.firstSeasonId).toBeNull();
    expect(game.map('calypso-casino')?.firstSeasonId).toBe('Y11S2');
    // Every release season is a config season, and the newest operator is Noor.
    const order: string[] = config.seasons.map((s) => s.id);
    const releases = config.operators.flatMap((o) => (o.firstSeasonId ? [order.indexOf(o.firstSeasonId)] : []));
    expect(Math.max(...releases)).toBe(order.indexOf('Y11S3'));
    for (const id of ['close-quarter', 'stadium-alpha', 'stadium-bravo', 'favela', 'house', 'tower', 'yacht', 'presidential-plane', 'hereford-base']) {
      expect(game.map(id)?.playlistKinds, id).not.toContain('ranked');
    }
    expect(game.map('bank')?.playlistKinds).toBeNull();
  });
});

describe('game index lookups', () => {
  test('releasedIn: from the release season on, always for null, never for an unknown season', () => {
    const noor = game.operator('noor');
    const ace = game.operator('ace');
    if (!noor || !ace) throw new Error('operators missing');
    expect(game.releasedIn(noor, 'Y11S2')).toBe(false);
    expect(game.releasedIn(noor, 'Y11S3')).toBe(true);
    expect(game.releasedIn(noor, 'Y11S4')).toBe(true);
    expect(game.releasedIn(ace, 'Y7S4')).toBe(true);
    expect(game.releasedIn(ace, 'Y99S1')).toBe(false);
    const casino = game.map('calypso-casino');
    expect(casino && game.releasedIn(casino, 'Y11S1')).toBe(false);
    expect(casino && game.releasedIn(casino, 'Y11S2')).toBe(true);
  });

  test('currentSeasonAt: the season in force, else the config fallback', () => {
    expect(game.currentSeasonAt('2026-11-30T23:59:00.000Z').id).toBe('Y11S3');
    expect(game.currentSeasonAt('2026-12-01T00:00:00.000Z').id).toBe('Y11S4');
    expect(game.currentSeasonAt('2019-01-01T00:00:00.000Z').id).toBe(config.currentSeasonId);
    expect(game.currentSeasonAt('not a date').id).toBe(config.currentSeasonId);
  });

  test('rankForPoints: division boundaries, open-ended top, null below the lowest rank', () => {
    expect(game.rankForPoints('ranked-3', 999)).toBeNull();
    expect(game.rankForPoints('ranked-3', 1000)?.id).toBe('r3.copper-5');
    expect(game.rankForPoints('ranked-3', 1099)?.id).toBe('r3.copper-5');
    expect(game.rankForPoints('ranked-3', 1100)?.id).toBe('r3.copper-4');
    expect(game.rankForPoints('ranked-3', 4499)?.id).toBe('r3.diamond-1');
    expect(game.rankForPoints('ranked-3', 4500)?.id).toBe('r3.champion-5');
    expect(game.rankForPoints('ranked-3', 4900)?.id).toBe('r3.champion-1');
    expect(game.rankForPoints('ranked-3', 9_999_999)?.id).toBe('r3.champion-1');
    expect(game.rankForPoints('ranked-2', 4500)?.id).toBe('r2.champions');
    expect(game.rankForPoints('ranked-2', 8400)?.id).toBe('r2.champions');
    expect(game.rankForPoints('no-such-system', 2000)).toBeNull();
    expect(game.rankForPoints('ranked-3', Number.NaN)).toBeNull();
  });

  test('seasonAt uses [startsAt, endsAt) and the open end of the last season', () => {
    expect(game.seasonAt('2026-09-01T00:00:00.000Z')?.id).toBe('Y11S3');
    expect(game.seasonAt('2026-08-31T23:59:59.999Z')?.id).toBe('Y11S2');
    expect(game.seasonAt('2026-11-15T12:00:00.000Z')?.id).toBe('Y11S3');
    expect(game.seasonAt('2030-01-01T00:00:00.000Z')?.id).toBe('Y11S4');
    expect(game.seasonAt('2020-01-01T00:00:00.000Z')).toBeNull();
    expect(game.seasonAt('not a date')).toBeNull();
    expect(game.seasonsDescending()[0]?.id).toBe('Y11S4');
    expect(game.previousSeason('Y11S3')?.id).toBe('Y11S2');
    expect(game.previousSeason('Y7S4')).toBeNull();
    expect(game.currentSeason().id).toBe('Y11S3');
  });

  test('unknown ids answer null or an empty list, never throw', () => {
    expect(game.season('Y99S9')).toBeNull();
    expect(game.rank('r9.gold-1')).toBeNull();
    expect(game.tier('nope')).toBeNull();
    expect(game.playlist('siege-cup')).toBeNull();
    expect(game.operator('recruit')).toBeNull();
    expect(game.map('district')).toBeNull();
    expect(game.region('mars')).toBeNull();
    expect(game.rankSystemFor('Y1S1')).toBeNull();
    expect(game.ranksOf('nope')).toEqual([]);
  });

  test('resolveExternalId: trimmed, case-insensitive, per source, null when unknown', () => {
    expect(game.resolveExternalId('playlist', 'overwolf', 'RANKED')).toBe('ranked');
    expect(game.resolveExternalId('playlist', 'overwolf', '  quick match ')).toBe('quick-match');
    expect(game.resolveExternalId('playlist', 'overwolf', 'UNRANKED')).toBe('standard');
    expect(game.resolveExternalId('playlist', 'backend', 'pvp_ranked')).toBe('ranked');
    expect(game.resolveExternalId('playlist', 'backend', 'PVP_LIVING_GAME_MODE')).toBe('dual-front');
    expect(game.resolveExternalId('playlist', 'overwolf', 'pvp_ranked')).toBeNull(); // a backend name is not an Overwolf one
    expect(game.resolveExternalId('operator', 'overwolf', 'JACKAL')).toBe('jackal');
    expect(game.resolveExternalId('operator', 'overwolf', 'jäger')).toBe('jager');
    expect(game.resolveExternalId('operator', 'overwolf', 'JAGER')).toBe('jager');
    expect(game.resolveExternalId('operator', 'overwolf', 'SOLID  SNAKE')).toBe('solid-snake');
    expect(game.resolveExternalId('map', 'overwolf', 'CLUB HOUSE')).toBe('clubhouse');
    expect(game.resolveExternalId('map', 'overwolf', 'Kafe Dostoyevsky')).toBe('kafe-dostoyevsky');
    expect(game.resolveExternalId('map', 'overwolf', 'NightHaven')).toBe('nighthaven-labs');
    expect(game.resolveExternalId('region', 'backend', 'EUMENA')).toBe('emea');
    expect(game.resolveExternalId('map', 'overwolf', 'BARLETT UNIVERSITY')).toBeNull();
    expect(game.resolveExternalId('operator', 'overwolf', '')).toBeNull();
  });
});

describe('validateGameConfig', () => {
  const problemsOf = (broken: unknown): string => {
    try {
      validateGameConfig(broken);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error('expected the config to be rejected');
  };

  test('refuses a schema version it does not know, and things that are not configs', () => {
    expect(problemsOf({ ...raw(), schemaVersion: 2 })).toMatch(/schemaVersion: this app reads schema version 1, the config has 2/);
    expect(problemsOf(null)).toMatch(/must be an object/);
    expect(problemsOf([])).toMatch(/must be an object/);
  });

  test('lists every problem of a broken config, each with its path', () => {
    const c = raw() as unknown as GameConfig & Record<string, unknown>;
    const seasons = c.seasons as unknown as Record<string, unknown>[];
    (seasons[3] as Record<string, unknown>).rankSystemId = 'ranked-9';
    (seasons[5] as Record<string, unknown>).id = seasons[4]?.id;
    (seasons[6] as Record<string, unknown>).startsAt = '2023-13-45';
    const systems = c.rankSystems as unknown as { ranks: Record<string, unknown>[]; tiers: Record<string, unknown>[] }[];
    const r3 = systems[1] as { ranks: Record<string, unknown>[]; tiers: Record<string, unknown>[] };
    (r3.ranks[10] as Record<string, unknown>).minPoints = 2050; // gap / overlap
    (r3.tiers[2] as Record<string, unknown>).color = 'silver';
    (r3.ranks[39] as Record<string, unknown>).tierId = 'r3.nope';
    const operators = c.operators as unknown as Record<string, unknown>[];
    (operators[1] as Record<string, unknown>).id = operators[0]?.id;
    (operators[2] as Record<string, unknown>).side = 'both';
    const playlists = c.playlists as unknown as Record<string, unknown>[];
    (playlists[1] as Record<string, unknown>).leaderboard = { regionIds: ['na', 'mars'] };
    (playlists[2] as Record<string, unknown>).kind = 'casual';
    (playlists[3] as Record<string, unknown>).externalIds = { backend: ['pvp_ranked'], overwolf: [] }; // already Ranked's
    c.currentSeasonId = 'Y20S1' as never;

    const message = problemsOf(c);
    expect(message).toMatch(/^Invalid game config:/);
    expect(message).toContain('config.seasons[3].rankSystemId: unknown rank system "ranked-9"');
    expect(message).toContain('duplicate season id');
    expect(message).toContain('config.seasons[6].startsAt: must be a UTC ISO date-time');
    expect(message).toMatch(/ranks must be contiguous and ascending: "r3.silver-5" starts at 2050/);
    expect(message).toContain('config.rankSystems[1].tiers[2].color: must be a #RRGGBB colour (got "silver")');
    expect(message).toContain('config.rankSystems[1].ranks[39].tierId: unknown tier "r3.nope"');
    expect(message).toContain('duplicate operator id "ace"');
    expect(message).toContain('config.operators[2].side: must be "attack", "defense" or null');
    expect(message).toContain('config.playlists[1].leaderboard.regionIds[1]: unknown region "mars"');
    expect(message).toContain('config.playlists[2].kind: must be one of');
    expect(message).toContain('backend name "pvp_ranked" is claimed by both "ranked" and "quick-match"');
    expect(message).toContain('config.currentSeasonId: unknown season "Y20S1"');
    expect(message.split('\n').length).toBeGreaterThanOrEqual(13);
  });

  test('ranks out of order, an open rank that is not the top, and season numbers that do not match their id', () => {
    const c = raw() as unknown as { rankSystems: { ranks: Record<string, unknown>[] }[]; seasons: Record<string, unknown>[] };
    const ranks = c.rankSystems[0]?.ranks ?? [];
    (ranks[5] as Record<string, unknown>).maxPoints = null;
    (c.seasons[0] as Record<string, unknown>).number = 27;
    (c.seasons[1] as Record<string, unknown>).endsAt = null;
    const message = problemsOf(c);
    expect(message).toContain('only the top rank may have maxPoints null');
    expect(message).toContain('config.seasons[0].number: Y7S4 is season number 28, not 27');
    expect(message).toContain('"Y8S1" has no end date but "Y8S2" follows it');
  });

  test('round rules, release seasons and playlist kinds are checked', () => {
    const c = raw() as unknown as { playlists: Record<string, unknown>[]; operators: Record<string, unknown>[]; maps: Record<string, unknown>[] };
    const [ranked, legend, standard, quick, arcade] = c.playlists as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
    ranked.overtime = { at: 3, roundsToWin: 3 };
    legend.overtime = { at: 2.5, roundsToWin: 5 };
    standard.overtime = { at: 3, roundsToWin: 5 }; // standard also has decidingRoundAt 3
    quick.decidingRoundAt = 0;
    arcade.overtime = 'yes';
    const [op0] = c.operators as [Record<string, unknown>];
    op0.firstSeasonId = 'Y99S1';
    const [map0, map1, map2, map3, map4] = c.maps as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
    map0.firstSeasonId = 'Y3S1';
    map1.playlistKinds = [];
    map2.playlistKinds = ['ranked', 'casual'];
    map3.playlistKinds = ['ranked', 'ranked'];
    map4.playlistKinds = 'ranked';

    const message = problemsOf(c);
    expect(message).toContain('config.playlists[0].overtime.roundsToWin: must be greater than at');
    expect(message).toContain('config.playlists[1].overtime.at: must be an integer');
    expect(message).toContain('config.playlists[2].decidingRoundAt: must be null when overtime is set');
    expect(message).toContain('config.playlists[3].decidingRoundAt: must be a positive integer or null');
    expect(message).toContain('config.playlists[4].overtime: must be null or { at, roundsToWin }');
    expect(message).toContain('config.operators[0].firstSeasonId: unknown season "Y99S1"');
    expect(message).toContain('config.maps[0].firstSeasonId: unknown season "Y3S1"');
    expect(message).toContain('config.maps[1].playlistKinds: must be null (every kind) or list at least one kind');
    expect(message).toContain('config.maps[2].playlistKinds[1]: must be one of');
    expect(message).toContain('config.maps[3].playlistKinds: duplicate playlist kind id "ranked"');
    expect(message).toContain('config.maps[4].playlistKinds: must be an array');
  });

  test('unknown keys are dropped from the validated result', () => {
    const c = raw();
    c.extra = 'x';
    const firstMap = (c.maps as Record<string, unknown>[])[0];
    if (firstMap) firstMap.secret = 1;
    const validated = validateGameConfig(c) as unknown as Record<string, unknown>;
    expect('extra' in validated).toBe(false);
    expect('secret' in ((validated.maps as Record<string, unknown>[])[0] ?? {})).toBe(false);
  });
});
