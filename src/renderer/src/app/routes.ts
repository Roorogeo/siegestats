/** Every path in the app. The hash router keeps them after "#", so they work from a file:// page. */
export const ROUTES = {
  home: '/',
  leaderboards: '/leaderboards',
  legend: '/legend-division',
  profile: '/profile',
  live: '/live',
  settings: '/settings',
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
