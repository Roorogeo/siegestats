import { app } from 'electron';
import type { AppInfo } from '@shared/types/bridge';

/**
 * Which Electron build the app runs on. Sightline ships on Overwolf's (@overwolf/ow-electron), which adds
 * app.overwolf; plain Electron is still told apart so a misconfigured start is visible on the About screen.
 */
export function detectRuntime(): AppInfo['runtime'] {
  const overwolf = (app as Partial<Pick<Electron.App, 'overwolf'>>).overwolf;
  return overwolf ? 'ow-electron' : 'electron';
}
