import type { CacheEntry, CacheStore } from '../ports';

/**
 * Cached responses in memory (until SQLite arrives in phase 6). Values are stored as JSON text, as SQLite will
 * store them, so a caller that mutates what it received can never change what the cache holds.
 */
export function createMemoryCacheStore(): CacheStore & { size(): number } {
  const entries = new Map<string, Omit<CacheEntry, 'value'> & { json: string }>();
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      const { json, ...rest } = entry;
      return { ...rest, value: JSON.parse(json) as unknown };
    },
    async set({ value, ...rest }) {
      entries.set(rest.key, { ...rest, json: JSON.stringify(value) });
    },
    async clear() {
      entries.clear();
    },
    size: () => entries.size,
  };
}
