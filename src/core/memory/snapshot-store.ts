import type { ProfileSnapshot } from '@shared/types/storage';
import { jsonCopy } from '@shared/util/json';
import { playerKeyString } from '@shared/util/player';
import type { SnapshotStore } from '../ports';

/** Profile snapshots in memory (until SQLite arrives in phase 6): empty again after a restart. */
export function createMemorySnapshotStore(): SnapshotStore {
  const byPlayer = new Map<string, ProfileSnapshot[]>();
  return {
    async add(snapshot) {
      const key = playerKeyString(snapshot.player);
      const list = byPlayer.get(key) ?? [];
      list.push(jsonCopy(snapshot));
      byPlayer.set(key, list);
    },
    async list(player) {
      return jsonCopy(byPlayer.get(playerKeyString(player)) ?? []);
    },
    async latest(player) {
      const list = byPlayer.get(playerKeyString(player));
      const last = list?.[list.length - 1];
      return last ? jsonCopy(last) : null;
    },
  };
}
