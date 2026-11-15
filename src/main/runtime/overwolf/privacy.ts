import { app } from 'electron';

/**
 * ow-electron sends anonymous usage analytics (app launched, window shown) unless the app opts out, and the
 * opt-out is not remembered: it must be repeated on every launch, before app ready
 * (node_modules/@overwolf/ow-electron/ow-electron-types.d.ts:44-48 and the package README, "Anonymous Analytics").
 * The brief allows no telemetry unless the user opts in, so this runs first thing in main.
 */
export function applyOverwolfPrivacy({ analyticsOptIn }: { analyticsOptIn: boolean }): void {
  // The type augmentation says app.overwolf always exists; it does not on the vanilla Electron runtime.
  const overwolf = (app as Partial<Pick<Electron.App, 'overwolf'>>).overwolf;
  if (!overwolf) return;
  if (!analyticsOptIn) overwolf.disableAnonymousAnalytics();
  // Sightline shows no ads, so ad optimisation and first-party ad data are switched off unconditionally
  // (ow-electron-types.d.ts:50-58).
  overwolf.disableAdsOptimization();
  overwolf.disableAdsFPD();
}
