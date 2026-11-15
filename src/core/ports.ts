import type { IsoDateTime } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { StatsMethod } from '@shared/types/provider';
import type { AppSettings } from '@shared/types/settings';
import type { ProfileSnapshot } from '@shared/types/storage';

/** What core needs from the outside world. Main supplies Electron-backed versions; tests and the browser bridge supply in-memory ones. */

export interface SettingsStore {
  /** Whatever was saved last, unvalidated. null on first run. */
  load(): Promise<unknown>;
  save(settings: AppSettings): Promise<void>;
}

export interface LinkOpener {
  open(url: string): Promise<void>;
}

/**
 * Time, for core. Core never reads the system clock or sets timers itself: main and the browser bridge pass a
 * real clock (Date and setTimeout), tests a manual one, so every time-dependent behaviour is testable.
 */
export interface Clock {
  now(): IsoDateTime;
  /** Resolves after ms milliseconds (immediately for 0). */
  sleep(ms: number): Promise<void>;
}

/** One cached stats response. `value` is plain JSON-safe data. */
export interface CacheEntry {
  key: string;
  method: StatsMethod;
  value: unknown;
  storedAt: IsoDateTime;
  expiresAt: IsoDateTime | null; // null = kept until the cache is cleared
}

/** Cached provider responses (memory now, SQLite in phase 6). Expired entries are kept: they are the stale fallback. */
export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(entry: CacheEntry): Promise<void>;
  clear(): Promise<void>;
}

/** Stored profile refreshes; trend charts read these (phase 3). */
export interface SnapshotStore {
  add(snapshot: ProfileSnapshot): Promise<void>;
  /** That player's snapshots, oldest first. */
  list(player: PlayerKey): Promise<ProfileSnapshot[]>;
  latest(player: PlayerKey): Promise<ProfileSnapshot | null>;
}
