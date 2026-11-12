import type { IsoDateTime, Platform, ProviderId } from './primitives';
import type { PlayerKey, PlayerRef } from './player';
import type { ThemeSettings } from './theme';

/** Stored as key codes, not accelerator strings, so it feeds Electron and Overwolf hotkeys alike. */
export interface Hotkey {
  code: string; // KeyboardEvent.code, e.g. "KeyK"
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export type HotkeyAction = 'focusSearch' | 'navigateBack' | 'navigateForward' | 'toggleOverlay';

export interface PinnedAccount {
  player: PlayerRef;
  pinnedAt: IsoDateTime;
}

export interface AccountSettings {
  pinned: PinnedAccount[];
  active: PlayerKey | null; // null = nothing pinned -> onboarding
}

/** Persisted with electron-store. Window bounds are stored separately. */
export interface AppSettings {
  schemaVersion: 1;
  theme: ThemeSettings;
  defaultPlatform: Platform;
  /** Per provider, so demo accounts never mix with real ones. */
  accounts: Record<ProviderId, AccountSettings>;
  hotkeys: Record<HotkeyAction, Hotkey | null>; // defaults: Ctrl+K, Alt+Left, Alt+Right, none
  system: {
    launchOnStartup: boolean;
    minimizeToTray: boolean;
  };
  notifications: {
    favoriteRankChanged: boolean;
    matchSaved: boolean;
    seasonStarted: boolean;
  };
  privacy: {
    telemetryOptIn: boolean; // default false; nothing is sent while false
  };
}

/** One level deep: each field of a section is replaced whole; schemaVersion cannot be patched. */
export type SettingsPatch = { [K in Exclude<keyof AppSettings, 'schemaVersion'>]?: Partial<AppSettings[K]> };
