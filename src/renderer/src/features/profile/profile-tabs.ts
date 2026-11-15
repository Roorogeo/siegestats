/** The six sections of a player profile, in the order of the brief. The selected one lives in the URL (?tab=). */
export const PROFILE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'encounters', label: 'Encounters' },
  { id: 'operators', label: 'Operators' },
  { id: 'maps', label: 'Maps' },
  { id: 'linked', label: 'Linked accounts' },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]['id'];

/** The search parameter that holds the tab: /player/pc/<id>?tab=seasons. Overview is the default and is left out. */
export const PROFILE_TAB_PARAM = 'tab';

export const DEFAULT_PROFILE_TAB: ProfileTabId = 'overview';

/** Prefix of the tab and panel ids (tabPanelProps). */
export const PROFILE_TABS_ID = 'profile';

const isProfileTab = (value: string | null): value is ProfileTabId => PROFILE_TABS.some((tab) => tab.id === value);

/** The tab a link asks for; anything unknown or missing opens Overview. */
export const parseProfileTab = (value: string | null): ProfileTabId => (isProfileTab(value) ? value : DEFAULT_PROFILE_TAB);

/** "?tab=seasons" for a link that should open on that tab, "" for Overview. */
export const profileTabSearch = (tab: ProfileTabId): string => (tab === DEFAULT_PROFILE_TAB ? '' : `?${PROFILE_TAB_PARAM}=${tab}`);
