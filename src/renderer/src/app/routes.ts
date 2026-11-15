import type { MatchId, Platform, PlayerId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';

/** Every path in the app. The hash router keeps them after "#", so they work from a file:// page. */
export const ROUTES = {
  home: '/',
  leaderboards: '/leaderboards',
  legend: '/legend-division',
  profile: '/profile',
  live: '/live',
  settings: '/settings',
  /** Anyone's profile, mine included; "My Profile" (/profile) stays its own route. Build links with playerPath(). */
  player: '/player/:platform/:id',
  /** One match; `?pov=platform:id` = the player it was opened from. Build links with matchPath(). */
  match: '/match/:id',
  /** Development only (dev server and browser build): every shared component on real mock data. No link leads here. */
  devComponents: '/dev/components',
} as const;

export type TabId = 'home' | 'leaderboards' | 'legend' | 'profile' | 'live';

/** The five tabs of the brief, in order. */
export const TABS: readonly { id: TabId; label: string; path: string }[] = [
  { id: 'home', label: 'Home', path: ROUTES.home },
  { id: 'leaderboards', label: 'Leaderboards', path: ROUTES.leaderboards },
  { id: 'legend', label: 'Legend Division', path: ROUTES.legend },
  { id: 'profile', label: 'My Profile', path: ROUTES.profile },
  { id: 'live', label: 'Live Match', path: ROUTES.live },
];

export const SETTINGS_SECTIONS = ['themes', 'general', 'accounts', 'hotkeys', 'data', 'about'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const settingsPath = (section: SettingsSection = 'themes'): string => `${ROUTES.settings}/${section}`;

const PLATFORMS: readonly Platform[] = ['pc', 'psn', 'xbl'];
const isPlatform = (value: unknown): value is Platform => typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);

/** Longest id accepted from a URL: ids are opaque, but a link should not carry an essay. */
const MAX_ID_LENGTH = 128;
const validId = (id: string | undefined): id is string => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH;

/** "/player/pc/<id>": opening a player from anywhere is navigate(playerPath(key)). */
export const playerPath = (player: PlayerKey): string => `/player/${player.platform}/${encodeURIComponent(player.id)}`;

/** The player of a /player/:platform/:id route (React Router has already decoded the params), or null for a bad link. */
export function parsePlayerParams(params: { platform?: string | undefined; id?: string | undefined }): PlayerKey | null {
  if (!isPlatform(params.platform) || !validId(params.id)) return null;
  return { platform: params.platform, id: params.id as PlayerId };
}

/** "platform:id", the form of a player in a query string. */
const playerParam = (player: PlayerKey): string => `${player.platform}:${encodeURIComponent(player.id)}`;

/** "/match/<id>", plus "?pov=pc:<id>" to list that player's team first and mark their row. */
export const matchPath = (id: MatchId, pov: PlayerKey | null = null): string =>
  `/match/${encodeURIComponent(id)}${pov ? `?pov=${playerParam(pov)}` : ''}`;

/** The match id of a /match/:id route, or null for a bad link. */
export function parseMatchParams(params: { id?: string | undefined }): MatchId | null {
  return validId(params.id) ? (params.id as MatchId) : null;
}

/**
 * The point-of-view player of a match link, from the location's search string ("?pov=pc:<id>"), or null when there
 * is none or it is malformed.
 */
export function parsePov(search: string): PlayerKey | null {
  const raw = search.replace(/^\?/, '').split('&').find((part) => part.startsWith('pov='));
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw.slice(4).replace(/\+/g, ' '));
  } catch {
    return null;
  }
  const colon = value.indexOf(':');
  if (colon < 0) return null;
  return parsePlayerParams({ platform: value.slice(0, colon), id: value.slice(colon + 1) });
}
