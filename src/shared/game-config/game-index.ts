import type {
  GameConfig, MapDef, OperatorDef, PlaylistDef, RankDef, RankSystemDef, RankTierDef, RegionDef, SeasonDef,
} from '../types/game-config';
import type { MapId, OperatorId, PlaylistId, RegionId, Side } from '../types/primitives';
import { toMs } from '../util/time';
import { normalizeExternalName } from './validate';

export type ExternalKind = 'playlist' | 'operator' | 'map' | 'region';
export type ExternalSource = 'backend' | 'overwolf';
export interface ExternalIdOf {
  playlist: PlaylistId;
  operator: OperatorId;
  map: MapId;
  region: RegionId;
}

/**
 * Lookups over a validated GameConfig, used everywhere a season, rank, playlist, operator, map or region is
 * named. Every lookup answers null (or an empty list) for an id it does not know; none of them throws, so data
 * from a newer game version degrades to "unknown" instead of crashing.
 */
export interface GameIndex {
  readonly config: GameConfig;
  season(id: string): SeasonDef | null;
  /**
   * The config's currentSeasonId (validated to exist). Only a fallback: code that means "the season in force now"
   * calls currentSeasonAt(now), so the answer moves at a season start without a config edit.
   */
  currentSeason(): SeasonDef;
  /**
   * The season in force at that moment: seasonAt(iso), or currentSeason() when the date is outside every season.
   * The one rule for "current season" in core, the mock and the renderer.
   */
  currentSeasonAt(iso: string): SeasonDef;
  /** The season whose [startsAt, endsAt) contains the date; the last season is open-ended when its endsAt is null. */
  seasonAt(iso: string): SeasonDef | null;
  /** Newest first. */
  seasonsDescending(): readonly SeasonDef[];
  /** The season before the given one in the config, or null for the first (or an unknown id). */
  previousSeason(id: string): SeasonDef | null;
  rankSystem(id: string): RankSystemDef | null;
  rankSystemFor(seasonId: string): RankSystemDef | null;
  rank(rankId: string): RankDef | null;
  tier(tierId: string): RankTierDef | null;
  /** The tier a rank belongs to. */
  tierOf(rankId: string): RankTierDef | null;
  /** The division these points fall in. null below the lowest rank, or for an unknown system. */
  rankForPoints(rankSystemId: string, points: number): RankDef | null;
  /** Lowest first. */
  ranksOf(rankSystemId: string): readonly RankDef[];
  playlist(id: string): PlaylistDef | null;
  /** Playlists whose matches carry points ('ladder' or 'plain'), in config order. */
  playlistsWithPoints(): readonly PlaylistDef[];
  /** Whether the playlist existed in that season, by its firstSeasonId / lastSeasonId. */
  playlistActiveIn(playlistId: string, seasonId: string): boolean;
  /**
   * Whether an operator or map existed in that season: released in it or before, by its firstSeasonId (null =
   * before the config's first season). false for a season the config does not know.
   */
  releasedIn(entity: { readonly firstSeasonId: string | null }, seasonId: string): boolean;
  operator(id: string): OperatorDef | null;
  /** Operators of that side, plus those playable on both sides. */
  operatorsBySide(side: Side): readonly OperatorDef[];
  map(id: string): MapDef | null;
  region(id: string): RegionDef | null;
  /** Upstream name -> our id. Trimmed, case-insensitive; null when the name is not in the config. */
  resolveExternalId<K extends ExternalKind>(kind: K, source: ExternalSource, name: string): ExternalIdOf[K] | null;
}

const byId = <T extends { id: string }>(items: readonly T[]): Map<string, T> => new Map(items.map((item) => [item.id, item]));

export function createGameIndex(config: GameConfig): GameIndex {
  const seasons = byId(config.seasons);
  const seasonOrder = new Map<string, number>(config.seasons.map((s, i) => [s.id, i]));
  const seasonsDescending = [...config.seasons].reverse();
  const systems = byId(config.rankSystems);
  const ranks = new Map<string, RankDef>();
  const tiers = new Map<string, RankTierDef>();
  for (const system of config.rankSystems) {
    for (const rank of system.ranks) ranks.set(rank.id, rank);
    for (const tier of system.tiers) tiers.set(tier.id, tier);
  }
  const playlists = byId(config.playlists);
  const withPoints = config.playlists.filter((p) => p.points !== null);
  const operators = byId(config.operators);
  const bySide: Record<Side, readonly OperatorDef[]> = {
    attack: config.operators.filter((o) => o.side === 'attack' || o.side === null),
    defense: config.operators.filter((o) => o.side === 'defense' || o.side === null),
  };
  const maps = byId(config.maps);
  const regions = byId(config.regions);

  const external: Record<ExternalKind, Record<ExternalSource, Map<string, string>>> = {
    playlist: { backend: new Map(), overwolf: new Map() },
    operator: { backend: new Map(), overwolf: new Map() },
    map: { backend: new Map(), overwolf: new Map() },
    region: { backend: new Map(), overwolf: new Map() },
  };
  const register = (kind: ExternalKind, items: readonly { id: string; externalIds: { backend: string[]; overwolf: string[] } }[]) => {
    for (const item of items) {
      for (const source of ['backend', 'overwolf'] as const) {
        for (const name of item.externalIds[source]) external[kind][source].set(normalizeExternalName(name), item.id);
      }
    }
  };
  register('playlist', config.playlists);
  register('operator', config.operators);
  register('map', config.maps);
  register('region', config.regions);

  const current = seasons.get(config.currentSeasonId) ?? (config.seasons[config.seasons.length - 1] as SeasonDef);

  const index: GameIndex = {
    config,
    season: (id) => seasons.get(id) ?? null,
    currentSeason: () => current,
    currentSeasonAt: (iso) => index.seasonAt(iso) ?? current,
    seasonAt(iso) {
      const t = toMs(iso);
      if (Number.isNaN(t)) return null;
      for (const season of seasonsDescending) {
        if (toMs(season.startsAt) > t) continue;
        return season.endsAt === null || t < toMs(season.endsAt) ? season : null;
      }
      return null;
    },
    seasonsDescending: () => seasonsDescending,
    previousSeason(id) {
      const i = seasonOrder.get(id);
      return i === undefined || i === 0 ? null : (config.seasons[i - 1] ?? null);
    },
    rankSystem: (id) => systems.get(id) ?? null,
    rankSystemFor(seasonId) {
      const systemId = seasons.get(seasonId)?.rankSystemId;
      return systemId ? (systems.get(systemId) ?? null) : null;
    },
    rank: (rankId) => ranks.get(rankId) ?? null,
    tier: (tierId) => tiers.get(tierId) ?? null,
    tierOf(rankId) {
      const rank = ranks.get(rankId);
      return rank ? (tiers.get(rank.tierId) ?? null) : null;
    },
    rankForPoints(rankSystemId, points) {
      const system = systems.get(rankSystemId);
      if (!system || !Number.isFinite(points)) return null;
      let found: RankDef | null = null;
      for (const rank of system.ranks) {
        if (rank.minPoints > points) break;
        found = rank;
      }
      if (found && found.maxPoints !== null && points > found.maxPoints) return null;
      return found;
    },
    ranksOf: (rankSystemId) => systems.get(rankSystemId)?.ranks ?? [],
    playlist: (id) => playlists.get(id) ?? null,
    playlistsWithPoints: () => withPoints,
    playlistActiveIn(playlistId, seasonId) {
      const playlist = playlists.get(playlistId);
      const at = seasonOrder.get(seasonId);
      if (!playlist || at === undefined) return false;
      const first = playlist.firstSeasonId === null ? 0 : (seasonOrder.get(playlist.firstSeasonId) ?? 0);
      const last = playlist.lastSeasonId === null ? Infinity : (seasonOrder.get(playlist.lastSeasonId) ?? Infinity);
      return at >= first && at <= last;
    },
    releasedIn(entity, seasonId) {
      const at = seasonOrder.get(seasonId);
      if (at === undefined) return false;
      return entity.firstSeasonId === null || at >= (seasonOrder.get(entity.firstSeasonId) ?? 0);
    },
    operator: (id) => operators.get(id) ?? null,
    operatorsBySide: (side) => bySide[side] ?? [],
    map: (id) => maps.get(id) ?? null,
    region: (id) => regions.get(id) ?? null,
    resolveExternalId<K extends ExternalKind>(kind: K, source: ExternalSource, name: string): ExternalIdOf[K] | null {
      if (typeof name !== 'string') return null;
      const table = external[kind]?.[source];
      return ((table?.get(normalizeExternalName(name)) ?? null) as ExternalIdOf[K] | null);
    },
  };
  return index;
}
