import type {
  ExternalIds, GameConfig, MapDef, OperatorDef, PlaylistDef, PlaylistKind, RankDef, RankSystemDef, RankTierDef, RegionDef,
  SeasonDef,
} from '../types/game-config';
import type {
  HexColor, IsoDateTime, MapId, OperatorId, PlaylistId, RankId, RankSystemId, RankTierId, RegionId, SeasonId, Side,
} from '../types/primitives';
import { isIsoDateTime, toMs } from '../util/time';

/**
 * Checks config/game/*.json (merged) against the GameConfig type and its rules, and rebuilds it field by field
 * so nothing the type does not name survives. Throws one Error that lists every problem, each with its path.
 */

export const GAME_CONFIG_SCHEMA_VERSION = 1;

const PLAYLIST_KINDS: readonly PlaylistKind[] = [
  'ranked', 'legend', 'standard', 'quick', 'arcade', 'event', 'training', 'custom', 'other',
];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const SEASON_CODE = /^Y(\d+)S(\d+)$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

class Problems {
  readonly list: string[] = [];
  add(path: string, message: string): void {
    this.list.push(`${path}: ${message}`);
  }

  string(o: Obj, key: string, path: string): string {
    const v = o[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
    this.add(`${path}.${key}`, 'must be a non-empty string');
    return '';
  }

  nullableString(o: Obj, key: string, path: string): string | null {
    if (o[key] === null) return null;
    return this.string(o, key, path);
  }

  bool(o: Obj, key: string, path: string): boolean {
    const v = o[key];
    if (typeof v === 'boolean') return v;
    this.add(`${path}.${key}`, 'must be true or false');
    return false;
  }

  int(o: Obj, key: string, path: string): number {
    const v = o[key];
    if (typeof v === 'number' && Number.isInteger(v)) return v;
    this.add(`${path}.${key}`, 'must be an integer');
    return 0;
  }

  iso(o: Obj, key: string, path: string): IsoDateTime {
    const v = o[key];
    if (isIsoDateTime(v)) return v;
    this.add(`${path}.${key}`, `must be a UTC ISO date-time like 2026-09-01T00:00:00.000Z (got ${JSON.stringify(v)})`);
    return '1970-01-01T00:00:00.000Z' as IsoDateTime;
  }

  hex(o: Obj, key: string, path: string): HexColor {
    const v = o[key];
    if (typeof v === 'string' && HEX.test(v)) return v as HexColor;
    this.add(`${path}.${key}`, `must be a #RRGGBB colour (got ${JSON.stringify(v)})`);
    return '#000000';
  }

  array(o: Obj, key: string, path: string): unknown[] {
    const v = o[key];
    if (Array.isArray(v)) return v;
    this.add(`${path}.${key}`, 'must be an array');
    return [];
  }

  objects(o: Obj, key: string, path: string): { item: Obj; path: string }[] {
    return this.array(o, key, path).flatMap((item, i) => {
      const at = `${path}.${key}[${i}]`;
      if (isObj(item)) return [{ item, path: at }];
      this.add(at, 'must be an object');
      return [];
    });
  }

  unique(ids: readonly string[], path: string, what: string): void {
    const seen = new Set<string>();
    for (const id of ids) {
      if (id === '') continue;
      if (seen.has(id)) this.add(path, `duplicate ${what} id "${id}"`);
      seen.add(id);
    }
  }
}

function externalIds(p: Problems, o: Obj, path: string): ExternalIds {
  const raw = o.externalIds;
  const at = `${path}.externalIds`;
  if (!isObj(raw)) {
    p.add(at, 'must be an object { backend: string[], overwolf: string[] }');
    return { backend: [], overwolf: [] };
  }
  const list = (key: 'backend' | 'overwolf'): string[] =>
    p.array(raw, key, at).flatMap((v, i) => {
      if (typeof v === 'string' && v.trim().length > 0) return [v];
      p.add(`${at}.${key}[${i}]`, 'must be a non-empty string');
      return [];
    });
  return { backend: list('backend'), overwolf: list('overwolf') };
}

function badge(p: Problems, o: Obj, path: string): { initials: string; color: HexColor } {
  const initials = p.string(o, 'initials', path);
  if (initials.length > 3) p.add(`${path}.initials`, `must be 1-3 characters (got "${initials}")`);
  return { initials, color: p.hex(o, 'color', path) };
}

/** Upstream names are matched trimmed and case-insensitively (see game-index.ts), so duplicates are judged the same way. */
export const normalizeExternalName = (name: string): string => name.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();

function uniqueExternalIds(p: Problems, kind: string, entities: readonly { id: string; externalIds: ExternalIds }[]): void {
  for (const source of ['backend', 'overwolf'] as const) {
    const owner = new Map<string, string>();
    for (const entity of entities) {
      for (const name of entity.externalIds[source]) {
        const key = normalizeExternalName(name);
        const previous = owner.get(key);
        if (previous !== undefined && previous !== entity.id) {
          p.add(`${kind}`, `${source} name "${name}" is claimed by both "${previous}" and "${entity.id}"`);
        }
        owner.set(key, entity.id);
      }
    }
  }
}

function rankSystems(p: Problems, root: Obj): RankSystemDef[] {
  const systems: RankSystemDef[] = [];
  const allTierIds: string[] = [];
  const allRankIds: string[] = [];
  for (const { item, path } of p.objects(root, 'rankSystems', 'config')) {
    const id = p.string(item, 'id', path) as RankSystemId;
    const tiers: RankTierDef[] = p.objects(item, 'tiers', path).map(({ item: t, path: tp }) => ({
      id: p.string(t, 'id', tp) as RankTierId,
      name: p.string(t, 'name', tp),
      ...badge(p, t, tp),
    }));
    if (tiers.length === 0) p.add(`${path}.tiers`, 'must list at least one tier');
    const ranks: RankDef[] = p.objects(item, 'ranks', path).map(({ item: r, path: rp }) => {
      const maxRaw = r.maxPoints;
      const maxPoints = maxRaw === null ? null : p.int(r, 'maxPoints', rp);
      return {
        id: p.string(r, 'id', rp) as RankId,
        tierId: p.string(r, 'tierId', rp) as RankTierId,
        name: p.string(r, 'name', rp),
        shortName: p.string(r, 'shortName', rp),
        minPoints: p.int(r, 'minPoints', rp),
        maxPoints,
      };
    });
    if (ranks.length === 0) p.add(`${path}.ranks`, 'must list at least one rank');

    p.unique(tiers.map((t) => t.id), `${path}.tiers`, 'tier');
    p.unique(ranks.map((r) => r.shortName), `${path}.ranks`, 'rank shortName');
    const tierIndex = new Map<string, number>(tiers.map((t, i) => [t.id, i]));
    let lastTier = -1;
    ranks.forEach((rank, i) => {
      const at = `${path}.ranks[${i}]`;
      const tier = tierIndex.get(rank.tierId);
      if (tier === undefined) p.add(`${at}.tierId`, `unknown tier "${rank.tierId}" (rank system "${id}" has ${tiers.map((t) => t.id).join(', ')})`);
      else if (tier < lastTier) p.add(`${at}.tierId`, `tier "${rank.tierId}" comes after a higher tier: ranks must be lowest first`);
      else lastTier = tier;
      if (rank.maxPoints !== null && rank.maxPoints < rank.minPoints) {
        p.add(at, `maxPoints ${rank.maxPoints} is below minPoints ${rank.minPoints}`);
      }
      const prev = ranks[i - 1];
      if (prev) {
        if (prev.maxPoints === null) p.add(at, `follows "${prev.id}", which is open-ended: only the top rank may have maxPoints null`);
        else if (rank.minPoints !== prev.maxPoints + 1) {
          p.add(at, `ranks must be contiguous and ascending: "${rank.id}" starts at ${rank.minPoints}, "${prev.id}" ends at ${prev.maxPoints}`);
        }
      }
    });
    allTierIds.push(...tiers.map((t) => t.id));
    allRankIds.push(...ranks.map((r) => r.id));
    systems.push({ id, name: p.string(item, 'name', path), tiers, ranks });
  }
  p.unique(systems.map((s) => s.id), 'config.rankSystems', 'rank system');
  // Ids are unique across systems, so a RankId or RankTierId alone names one division / tier.
  p.unique(allTierIds, 'config.rankSystems', 'tier');
  p.unique(allRankIds, 'config.rankSystems', 'rank');
  return systems;
}

function seasons(p: Problems, root: Obj, systemIds: ReadonlySet<string>): SeasonDef[] {
  const list: SeasonDef[] = p.objects(root, 'seasons', 'config').map(({ item, path }) => {
    const id = p.string(item, 'id', path) as SeasonId;
    const number = p.int(item, 'number', path);
    const code = SEASON_CODE.exec(id);
    if (code) {
      const expected = (Number(code[1]) - 1) * 4 + Number(code[2]);
      if (number !== expected) p.add(`${path}.number`, `${id} is season number ${expected}, not ${number}`);
    } else if (id) {
      p.add(`${path}.id`, `must look like "Y11S3" (got "${id}")`);
    }
    const startsAt = p.iso(item, 'startsAt', path);
    const endsAt = item.endsAt === null ? null : p.iso(item, 'endsAt', path);
    if (endsAt !== null && toMs(endsAt) <= toMs(startsAt)) p.add(`${path}.endsAt`, 'must be after startsAt');
    const rankSystemId = p.nullableString(item, 'rankSystemId', path) as RankSystemId | null;
    if (rankSystemId !== null && rankSystemId !== '' && !systemIds.has(rankSystemId)) {
      p.add(`${path}.rankSystemId`, `unknown rank system "${rankSystemId}"`);
    }
    return { id, number, name: p.string(item, 'name', path), startsAt, endsAt, rankSystemId };
  });
  if (list.length === 0) p.add('config.seasons', 'must list at least one season');
  p.unique(list.map((s) => s.id), 'config.seasons', 'season');
  list.forEach((season, i) => {
    const next = list[i + 1];
    if (!next) return;
    const at = `config.seasons[${i + 1}]`;
    if (next.number <= season.number || toMs(next.startsAt) <= toMs(season.startsAt)) {
      p.add(at, `"${next.id}" must come after "${season.id}": seasons are listed oldest first`);
    }
    if (season.endsAt === null) p.add(`config.seasons[${i}].endsAt`, `"${season.id}" has no end date but "${next.id}" follows it`);
    else if (toMs(season.endsAt) > toMs(next.startsAt)) {
      p.add(`config.seasons[${i}].endsAt`, `"${season.id}" ends after "${next.id}" starts`);
    }
  });
  return list;
}

function regions(p: Problems, root: Obj): RegionDef[] {
  const list = p.objects(root, 'regions', 'config').map(({ item, path }) => ({
    id: p.string(item, 'id', path) as RegionId,
    name: p.string(item, 'name', path),
    shortName: p.string(item, 'shortName', path),
    externalIds: externalIds(p, item, path),
  }));
  p.unique(list.map((r) => r.id), 'config.regions', 'region');
  return list;
}

/** A nullable season id that must name a season in the config. */
function knownSeasonOf(p: Problems, seasonOrder: ReadonlyMap<string, number>, o: Obj, key: string, path: string): SeasonId | null {
  const value = p.nullableString(o, key, path);
  if (value === null || value === '') return null;
  if (!seasonOrder.has(value)) p.add(`${path}.${key}`, `unknown season "${value}"`);
  return value as SeasonId;
}

/** A positive integer, or null when the key holds null. */
function positiveIntOrNull(p: Problems, o: Obj, key: string, path: string): number | null {
  if (o[key] === null) return null;
  const v = p.int(o, key, path);
  if (v < 1) p.add(`${path}.${key}`, 'must be a positive integer or null');
  return v;
}

function overtimeOf(p: Problems, o: Obj, path: string): PlaylistDef['overtime'] {
  const v = o.overtime;
  if (v === null) return null;
  if (!isObj(v)) {
    p.add(`${path}.overtime`, 'must be null or { at, roundsToWin }');
    return null;
  }
  const at = positiveIntOrNull(p, v, 'at', `${path}.overtime`) ?? 0;
  const roundsToWin = positiveIntOrNull(p, v, 'roundsToWin', `${path}.overtime`) ?? 0;
  if (roundsToWin <= at) p.add(`${path}.overtime.roundsToWin`, 'must be greater than at');
  return { at, roundsToWin };
}

function playlists(p: Problems, root: Obj, seasonOrder: ReadonlyMap<string, number>, regionIds: ReadonlySet<string>): PlaylistDef[] {
  const list = p.objects(root, 'playlists', 'config').map(({ item, path }): PlaylistDef => {
    const kind = item.kind as PlaylistKind;
    if (!PLAYLIST_KINDS.includes(kind)) p.add(`${path}.kind`, `must be one of ${PLAYLIST_KINDS.join(', ')} (got ${JSON.stringify(item.kind)})`);
    const points = item.points;
    if (points !== 'ladder' && points !== 'plain' && points !== null) p.add(`${path}.points`, 'must be "ladder", "plain" or null');
    let leaderboard: PlaylistDef['leaderboard'] = null;
    if (item.leaderboard !== null) {
      if (!isObj(item.leaderboard)) p.add(`${path}.leaderboard`, 'must be null or { regionIds: [] }');
      else {
        const ids = p.array(item.leaderboard, 'regionIds', `${path}.leaderboard`).map((v, i) => {
          const at = `${path}.leaderboard.regionIds[${i}]`;
          if (typeof v !== 'string' || !regionIds.has(v)) p.add(at, `unknown region ${JSON.stringify(v)}`);
          return String(v) as RegionId;
        });
        p.unique(ids, `${path}.leaderboard.regionIds`, 'region');
        leaderboard = { regionIds: ids };
      }
    }
    const firstSeasonId = knownSeasonOf(p, seasonOrder, item, 'firstSeasonId', path);
    const lastSeasonId = knownSeasonOf(p, seasonOrder, item, 'lastSeasonId', path);
    const overtime = overtimeOf(p, item, path);
    const decidingRoundAt = positiveIntOrNull(p, item, 'decidingRoundAt', path);
    if (overtime && decidingRoundAt !== null) p.add(`${path}.decidingRoundAt`, 'must be null when overtime is set');
    if (firstSeasonId && lastSeasonId && (seasonOrder.get(firstSeasonId) ?? 0) > (seasonOrder.get(lastSeasonId) ?? 0)) {
      p.add(`${path}.lastSeasonId`, `"${lastSeasonId}" is before firstSeasonId "${firstSeasonId}"`);
    }
    return {
      id: p.string(item, 'id', path) as PlaylistId,
      name: p.string(item, 'name', path),
      kind,
      points: points === 'ladder' || points === 'plain' ? points : null,
      leaderboard,
      liveMatchSupported: p.bool(item, 'liveMatchSupported', path),
      overtime,
      decidingRoundAt,
      firstSeasonId,
      lastSeasonId,
      externalIds: externalIds(p, item, path),
    };
  });
  p.unique(list.map((pl) => pl.id), 'config.playlists', 'playlist');
  return list;
}

function operators(p: Problems, root: Obj, seasonOrder: ReadonlyMap<string, number>): OperatorDef[] {
  const list = p.objects(root, 'operators', 'config').map(({ item, path }): OperatorDef => {
    const side = item.side;
    if (side !== 'attack' && side !== 'defense' && side !== null) p.add(`${path}.side`, 'must be "attack", "defense" or null');
    return {
      id: p.string(item, 'id', path) as OperatorId,
      name: p.string(item, 'name', path),
      side: side === 'attack' || side === 'defense' ? (side as Side) : null,
      firstSeasonId: knownSeasonOf(p, seasonOrder, item, 'firstSeasonId', path),
      ...badge(p, item, path),
      externalIds: externalIds(p, item, path),
    };
  });
  p.unique(list.map((o) => o.id), 'config.operators', 'operator');
  return list;
}

function playlistKindsOf(p: Problems, o: Obj, path: string): PlaylistKind[] | null {
  if (o.playlistKinds === null) return null;
  const kinds = p.array(o, 'playlistKinds', path).map((v, i) => {
    if (!PLAYLIST_KINDS.includes(v as PlaylistKind)) p.add(`${path}.playlistKinds[${i}]`, `must be one of ${PLAYLIST_KINDS.join(', ')}`);
    return v as PlaylistKind;
  });
  if (kinds.length === 0) p.add(`${path}.playlistKinds`, 'must be null (every kind) or list at least one kind');
  p.unique(kinds, `${path}.playlistKinds`, 'playlist kind');
  return kinds;
}

function maps(p: Problems, root: Obj, seasonOrder: ReadonlyMap<string, number>): MapDef[] {
  const list = p.objects(root, 'maps', 'config').map(({ item, path }): MapDef => ({
    id: p.string(item, 'id', path) as MapId,
    name: p.string(item, 'name', path),
    firstSeasonId: knownSeasonOf(p, seasonOrder, item, 'firstSeasonId', path),
    playlistKinds: playlistKindsOf(p, item, path),
    ...badge(p, item, path),
    externalIds: externalIds(p, item, path),
  }));
  p.unique(list.map((m) => m.id), 'config.maps', 'map');
  return list;
}

export function validateGameConfig(raw: unknown): GameConfig {
  const p = new Problems();
  if (!isObj(raw)) throw new Error('Invalid game config:\n- config: must be an object');

  if (raw.schemaVersion !== GAME_CONFIG_SCHEMA_VERSION) {
    // A shape this build does not know: nothing else can be trusted, so stop here.
    throw new Error(
      `Invalid game config:\n- config.schemaVersion: this app reads schema version ${GAME_CONFIG_SCHEMA_VERSION}, the config has ${JSON.stringify(raw.schemaVersion)}`,
    );
  }
  const dataVersion = p.string(raw, 'dataVersion', 'config');
  const updatedAt = p.iso(raw, 'updatedAt', 'config');

  const systems = rankSystems(p, raw);
  const seasonList = seasons(p, raw, new Set(systems.map((s) => s.id)));
  const seasonOrder = new Map<string, number>(seasonList.map((s, i) => [s.id, i]));
  const regionList = regions(p, raw);
  const playlistList = playlists(p, raw, seasonOrder, new Set(regionList.map((r) => r.id)));
  const operatorList = operators(p, raw, seasonOrder);
  const mapList = maps(p, raw, seasonOrder);

  const currentSeasonId = p.string(raw, 'currentSeasonId', 'config') as SeasonId;
  if (currentSeasonId && !seasonOrder.has(currentSeasonId)) p.add('config.currentSeasonId', `unknown season "${currentSeasonId}"`);

  uniqueExternalIds(p, 'config.playlists', playlistList);
  uniqueExternalIds(p, 'config.operators', operatorList);
  uniqueExternalIds(p, 'config.maps', mapList);
  uniqueExternalIds(p, 'config.regions', regionList);

  if (p.list.length > 0) throw new Error(`Invalid game config:\n${p.list.map((line) => `- ${line}`).join('\n')}`);
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    dataVersion,
    updatedAt,
    currentSeasonId,
    seasons: seasonList,
    rankSystems: systems,
    playlists: playlistList,
    operators: operatorList,
    maps: mapList,
    regions: regionList,
  };
}
