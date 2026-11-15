import manifest from '@config/game/manifest.json';
import seasons from '@config/game/seasons.json';
import rankSystems from '@config/game/rank-systems.json';
import playlists from '@config/game/playlists.json';
import operators from '@config/game/operators.json';
import maps from '@config/game/maps.json';
import regions from '@config/game/regions.json';
import type { GameConfig } from '../types/game-config';
import { validateGameConfig } from './validate';

let bundled: GameConfig | null = null;

/** The game config shipped with this build (config/game/*.json), merged and validated once. Throws if it is invalid. */
export function loadBundledGameConfig(): GameConfig {
  bundled ??= validateGameConfig({ ...manifest, ...seasons, ...rankSystems, ...playlists, ...operators, ...maps, ...regions });
  return bundled;
}
