import type { Unsubscribe } from './primitives';
import type { GameConfig, AppConfig, ExternalLink } from './game-config';
import type { PlayerKey, PlayerRef } from './player';
import type { AppSettings, SettingsPatch } from './settings';
import type { AppNotification } from './notifications';
import type { Favorite, RecentSearch, TrendQuery, TrendSeries } from './storage';
import type { LiveMatchView, LiveSimulation } from './live-match';
import type { AppError, StatsClient } from './provider';

export interface AppInfo {
  name: string;
  version: string;
  runtime: 'electron' | 'ow-electron' | 'browser';
  isDev: boolean;
  config: AppConfig;
}

/**
 * The ONLY surface between the UI and everything else, exposed by preload as window.bridge.
 * Two implementations: Electron (IPC to main) and a browser one that runs core/ in the page,
 * so the whole UI also runs in a plain browser for development and tests.
 * Every call resolves, or rejects with an AppError.
 */
export interface Bridge {
  app: {
    getInfo(): Promise<AppInfo>;
    getGameConfig(): Promise<GameConfig>; // loaded once at start-up; the renderer never imports the JSON itself
    openLink(link: ExternalLink): Promise<void>; // named links only, never an arbitrary URL
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(cb: (maximized: boolean) => void): Unsubscribe;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: SettingsPatch): Promise<AppSettings>;
    onChange(cb: (settings: AppSettings) => void): Unsubscribe;
  };
  stats: StatsClient;
  trends: {
    get(query: TrendQuery): Promise<TrendSeries>;
  };
  favorites: {
    list(): Promise<Favorite[]>;
    add(player: PlayerRef): Promise<void>;
    remove(player: PlayerKey): Promise<void>;
    onChange(cb: (favorites: Favorite[]) => void): Unsubscribe;
  };
  searches: {
    recent(): Promise<RecentSearch[]>;
    remember(player: PlayerRef): Promise<void>;
  };
  notifications: {
    list(): Promise<AppNotification[]>;
    markRead(ids: string[] | 'all'): Promise<void>;
    onChange(cb: (all: AppNotification[]) => void): Unsubscribe;
  };
  live: {
    getView(): Promise<LiveMatchView>;
    onView(cb: (view: LiveMatchView) => void): Unsubscribe;
    retry(): Promise<void>;
    simulate(simulation: LiveSimulation): Promise<void>; // dev builds only
  };
  overlay: {
    toggle(): Promise<void>;
  };
  data: {
    clearCache(): Promise<void>;
  };
}

/** Wire format of one IPC reply (a thrown error keeps only its message across ipcMain.handle). */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: AppError };
