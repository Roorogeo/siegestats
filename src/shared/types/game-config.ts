import type {
  HexColor, IsoDateTime, MapId, OperatorId, PlaylistId, RankId, RankSystemId, RankTierId, RegionId, SeasonId, Side,
} from './primitives';

/** config/game/*.json. Nothing in src/ hard-codes a season, playlist, rank, operator or map. */
export interface GameConfig {
  schemaVersion: 1; // shape of the files; the app refuses a version it does not know
  dataVersion: string; // content revision, bumped whenever the game changes
  updatedAt: IsoDateTime;
  currentSeasonId: SeasonId;
  seasons: SeasonDef[]; // oldest first
  rankSystems: RankSystemDef[];
  playlists: PlaylistDef[];
  operators: OperatorDef[];
  maps: MapDef[];
  regions: RegionDef[];
}

export interface SeasonDef {
  id: SeasonId;
  number: number; // upstream's integer id: (year - 1) * 4 + season
  name: string;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime | null; // null until announced
  /** The rank ladder in force that season. null = not in the config; ranks of that season render as "-". */
  rankSystemId: RankSystemId | null;
}

export interface RankSystemDef {
  id: RankSystemId;
  name: string;
  tiers: RankTierDef[]; // lowest first
  ranks: RankDef[]; // one per division, lowest first
}

/** Original badge art: initials on a colour. Theme-independent by design. */
export interface BadgeDef {
  initials: string;
  color: HexColor;
}

export interface RankTierDef extends BadgeDef {
  id: RankTierId;
  name: string;
}

export interface RankDef {
  id: RankId;
  tierId: RankTierId;
  name: string; // "Gold III"
  shortName: string; // "G3", for chart axes
  minPoints: number;
  maxPoints: number | null; // null = open-ended top rank
}

export type PlaylistKind = 'ranked' | 'legend' | 'standard' | 'quick' | 'arcade' | 'event' | 'training' | 'custom' | 'other';

export interface PlaylistDef {
  id: PlaylistId;
  name: string;
  kind: PlaylistKind;
  /** 'ladder' = points on the season's rank ladder. 'plain' = points with no divisions. null = no points. */
  points: 'ladder' | 'plain' | null;
  /** null = no leaderboard. regionIds [] = one board; otherwise one board per region. */
  leaderboard: { regionIds: RegionId[] } | null;
  liveMatchSupported: boolean; // false -> Live Match shows "mode not supported"
  firstSeasonId: SeasonId | null;
  lastSeasonId: SeasonId | null; // null = still running
  externalIds: ExternalIds;
}

export interface OperatorDef extends BadgeDef {
  id: OperatorId;
  name: string;
  side: Side | null; // null = playable on both sides
  externalIds: ExternalIds;
}

export interface MapDef extends BadgeDef {
  id: MapId;
  name: string;
  externalIds: ExternalIds;
}

export interface RegionDef {
  id: RegionId;
  name: string;
  shortName: string;
  externalIds: ExternalIds;
}

/** What other systems call this entity; the only place upstream names are mapped to our ids. */
export interface ExternalIds {
  backend: string[];
  overwolf: string[]; // matched case-insensitively; an unknown name degrades to "unknown", never crashes
}

export type ExternalLink = 'bug_report' | 'community';

/** config/app.json: build-time, not user-editable. URLs only, never keys. */
export interface AppConfig {
  schemaVersion: 1;
  provider: 'mock' | 'live';
  backendUrl: string | null; // null -> LiveProvider answers 'not_configured'
  links: Record<ExternalLink, string | null>; // null -> the link is hidden
}
