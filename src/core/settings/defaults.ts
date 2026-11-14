import type { IsoDateTime, Platform, PlayerId } from '@shared/types/primitives';
import type { AccountSettings, AppSettings, Hotkey, HotkeyAction, PinnedAccount } from '@shared/types/settings';
import { defaultThemeSettings, normalizeThemeSettings } from '@shared/theme';

const key = (code: string, mods: Partial<Pick<Hotkey, 'ctrl' | 'alt' | 'shift'>> = {}): Hotkey => ({
  code,
  ctrl: false,
  alt: false,
  shift: false,
  ...mods,
});

/** Ctrl+K, Alt+Left and Alt+Right come from the brief. The overlay toggle has no default. */
export const DEFAULT_HOTKEYS: Record<HotkeyAction, Hotkey | null> = {
  focusSearch: key('KeyK', { ctrl: true }),
  navigateBack: key('ArrowLeft', { alt: true }),
  navigateForward: key('ArrowRight', { alt: true }),
  toggleOverlay: null,
};

const emptyAccounts = (): AccountSettings => ({ pinned: [], active: null });

export const defaultSettings = (): AppSettings => ({
  schemaVersion: 1,
  theme: defaultThemeSettings(),
  defaultPlatform: 'pc',
  accounts: { mock: emptyAccounts(), live: emptyAccounts() },
  hotkeys: { ...DEFAULT_HOTKEYS },
  system: { launchOnStartup: false, minimizeToTray: false },
  notifications: { favoriteRankChanged: true, matchSaved: true, seasonStarted: true },
  privacy: { telemetryOptIn: false },
});

const PLATFORMS: readonly Platform[] = ['pc', 'psn', 'xbl'];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function hotkey(v: unknown, fallback: Hotkey | null): Hotkey | null {
  if (v === null) return null;
  if (!isRecord(v) || typeof v.code !== 'string' || v.code.length === 0) return fallback;
  return { code: v.code, ctrl: v.ctrl === true, alt: v.alt === true, shift: v.shift === true };
}

/** Most accounts one person plausibly pins; anything beyond is dropped. */
export const MAX_PINNED_ACCOUNTS = 20;
const shortString = (v: unknown, max = 128): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function playerRef(v: unknown): PinnedAccount['player'] | null {
  if (!isRecord(v) || !shortString(v.id) || !shortString(v.name) || !PLATFORMS.includes(v.platform as Platform)) return null;
  const avatarUrl = typeof v.avatarUrl === 'string' && /^https:\/\//.test(v.avatarUrl) && v.avatarUrl.length <= 2048 ? v.avatarUrl : null;
  return { platform: v.platform as Platform, id: v.id as PlayerId, name: v.name, avatarUrl };
}

/** Pins are rebuilt field by field: only what the types allow survives, whatever is on disk or in a patch. */
function accounts(v: unknown): AccountSettings {
  if (!isRecord(v) || !Array.isArray(v.pinned)) return emptyAccounts();
  const pinned: PinnedAccount[] = [];
  const seen = new Set<string>();
  for (const entry of v.pinned) {
    if (!isRecord(entry) || typeof entry.pinnedAt !== 'string' || Number.isNaN(Date.parse(entry.pinnedAt))) continue;
    const player = playerRef(entry.player);
    const key = player && `${player.platform}:${player.id}`;
    if (!player || !key || seen.has(key)) continue;
    seen.add(key);
    pinned.push({ player, pinnedAt: entry.pinnedAt as IsoDateTime });
    if (pinned.length === MAX_PINNED_ACCOUNTS) break;
  }
  const a = v.active;
  const active =
    isRecord(a) && pinned.some((p) => p.player.platform === a.platform && p.player.id === a.id)
      ? { platform: a.platform as Platform, id: a.id as PlayerId }
      : null;
  return { pinned, active };
}

/** Turns whatever is on disk into valid settings: unknown keys are dropped, bad values fall back to defaults. */
export function normalizeSettings(raw: unknown): AppSettings {
  const d = defaultSettings();
  if (!isRecord(raw)) return d;
  const system = isRecord(raw.system) ? raw.system : {};
  const notifications = isRecord(raw.notifications) ? raw.notifications : {};
  const privacy = isRecord(raw.privacy) ? raw.privacy : {};
  const hotkeys = isRecord(raw.hotkeys) ? raw.hotkeys : {};
  const acc = isRecord(raw.accounts) ? raw.accounts : {};
  return {
    schemaVersion: 1,
    theme: normalizeThemeSettings(isRecord(raw.theme) ? raw.theme : null),
    defaultPlatform: PLATFORMS.includes(raw.defaultPlatform as Platform) ? (raw.defaultPlatform as Platform) : d.defaultPlatform,
    accounts: { mock: accounts(acc.mock), live: accounts(acc.live) },
    hotkeys: {
      focusSearch: hotkey(hotkeys.focusSearch, d.hotkeys.focusSearch),
      navigateBack: hotkey(hotkeys.navigateBack, d.hotkeys.navigateBack),
      navigateForward: hotkey(hotkeys.navigateForward, d.hotkeys.navigateForward),
      toggleOverlay: hotkey(hotkeys.toggleOverlay, d.hotkeys.toggleOverlay),
    },
    system: {
      launchOnStartup: bool(system.launchOnStartup, d.system.launchOnStartup),
      minimizeToTray: bool(system.minimizeToTray, d.system.minimizeToTray),
    },
    notifications: {
      favoriteRankChanged: bool(notifications.favoriteRankChanged, d.notifications.favoriteRankChanged),
      matchSaved: bool(notifications.matchSaved, d.notifications.matchSaved),
      seasonStarted: bool(notifications.seasonStarted, d.notifications.seasonStarted),
    },
    privacy: { telemetryOptIn: bool(privacy.telemetryOptIn, d.privacy.telemetryOptIn) },
  };
}
