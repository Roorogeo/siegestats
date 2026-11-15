import { test } from 'vitest';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import { createGameIndex } from '@shared/game-config';
import { generateWorld } from '@core/stats/mock/generate-world';
import { generateAccounts } from '@core/stats/mock/players';
import { createRandom } from '@shared/util/random';
import type { IsoDateTime } from '@shared/types/primitives';
test('perf', () => {
  const game = createGameIndex(loadBundledGameConfig());
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    generateAccounts(createRandom(7).fork('accounts'), game);
    const t1 = performance.now();
    generateWorld({ seed: 7, now: '2026-11-15T12:00:00.000Z' as IsoDateTime, game });
    const t2 = performance.now();
    console.log('simT', (globalThis as any).__simT); (globalThis as any).__simT=0; console.log('accounts', Math.round(t1 - t0), 'world', Math.round(t2 - t1));
  }
});
