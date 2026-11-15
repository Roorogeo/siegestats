// loadBundledGameConfig lives in './bundled' and is imported from there, so code that only needs the lookups
// (the renderer, which receives the config over the bridge) never pulls the JSON files into its bundle.
export { GAME_CONFIG_SCHEMA_VERSION, normalizeExternalName, validateGameConfig } from './validate';
export {
  createGameIndex, type ExternalIdOf, type ExternalKind, type ExternalSource, type GameIndex,
} from './game-index';
