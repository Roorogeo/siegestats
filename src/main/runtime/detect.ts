import type { AppInfo } from '@shared/types/bridge';

/**
 * The only place that knows which Electron this is. Overwolf's build sets IS_OVERWOLF_ELECTRON;
 * everything Overwolf-specific (phase 7) will live next to this file and nowhere else.
 */
export function detectRuntime(): AppInfo['runtime'] {
  return 'IS_OVERWOLF_ELECTRON' in process.env ? 'ow-electron' : 'electron';
}
