import type { Platform, PlayerId } from '@shared/types/primitives';
import type { AccountSettings, AppSettings, Hotkey, HotkeyAction } from '@shared/types/settings';
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

function accounts(v: unknown): AccountSettings {
  if (!isRecord(v) || !Array.isArray(v.pinned)) return emptyAccounts();
  // Pinned accounts are validated properly when pinning arrives (phase 2); keep what has the right outline.
  const pinned = v.pinned.filter(
    (p): p is AccountSettings['pinned'][number] => isRecord(p) && isRecord(p.player) && typeof p.pinnedAt === 'string',
  );
  const a = v.active;
  const active =
    isRecord(a) && typeof a.id === 'string' && PLATFORMS.includes(a.platform as Platform)
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
