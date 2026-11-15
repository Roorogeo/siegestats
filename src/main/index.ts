import { app, dialog, Menu, nativeTheme, session, type BrowserWindow } from 'electron';
import appConfig from '@config/app.json';
import { createAppServices } from '@core/app-services';
import { normalizeSettings } from '@core/settings/defaults';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import { resolveActiveTheme } from '@shared/theme';
import type { AppConfig } from '@shared/types/game-config';
import { registerBridge } from './ipc/register';
import { detectRuntime } from './runtime/detect';
import { applyOverwolfPrivacy } from './runtime/overwolf/privacy';
import { createElectronSettingsStore } from './settings/electron-settings-store';
import { systemClock } from './system/clock';
import { externalLinks } from './system/links';
import { createMainWindow } from './window/main-window';

/**
 * Main process: wiring only. Product logic lives in src/core, UI in src/renderer;
 * this file connects them to Electron and owns nothing else.
 */
/** Windows app id (taskbar grouping, notifications). Publisher Rinkexe; do not change once released. */
const APP_ID = 'com.rinkexe.sightline';

// E2E tests point the app at a throwaway profile so they never touch real settings. Development builds only.
if (!app.isPackaged && process.env.SIGHTLINE_USER_DATA) app.setPath('userData', process.env.SIGHTLINE_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Before app ready, on every launch: Overwolf's runtime sends anonymous analytics unless told not to.
  // An unreadable settings file counts as "not opted in".
  const readOptIn = (): boolean => {
    try {
      return normalizeSettings(createElectronSettingsStore().readSync()).privacy.telemetryOptIn;
    } catch {
      return false;
    }
  };
  applyOverwolfPrivacy({ analyticsOptIn: readOptIn() });

  let mainWindow: BrowserWindow | null = null;

  const openMainWindow = (backgroundColor: string): void => {
    mainWindow = createMainWindow({ backgroundColor });
    mainWindow.on('closed', () => {
      mainWindow = null;
      // Closing the main window quits, even while a runtime-owned window is open (minimize-to-tray is phase 6).
      app.quit();
    });
  };

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => app.quit());

  void app
    .whenReady()
    .then(() => {
      app.setAppUserModelId(APP_ID);
      // Chromium fetches a spellcheck dictionary from Google on first use even with spellcheck off in the page.
      // An empty language list stops that: the app makes no network request the user did not ask for.
      session.defaultSession.setSpellCheckerLanguages([]);
      // The frameless window has no menu bar, but Electron's default menu would still bind Ctrl+R (a full reload that
      // bypasses the in-app Refresh) and the developer-tools shortcuts. Keep them only while developing.
      if (app.isPackaged) Menu.setApplicationMenu(null);

      const settingsStore = createElectronSettingsStore();
      const core = createAppServices({
        info: { name: app.getName(), version: app.getVersion(), runtime: detectRuntime(), isDev: !app.isPackaged },
        config: appConfig as AppConfig,
        gameConfig: loadBundledGameConfig(),
        clock: systemClock,
        settingsStore,
        links: externalLinks,
      });
      registerBridge(core);

      // The window is painted in the saved theme's background before any UI exists.
      const saved = normalizeSettings(settingsStore.readSync());
      const theme = resolveActiveTheme(saved.theme, nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
      openMainWindow(theme.tokens.bg);
    })
    .catch((error: unknown) => {
      // Never leave a process with no window holding the single-instance lock: every later launch would quit silently.
      dialog.showErrorBox('Sightline could not start', error instanceof Error ? error.message : String(error));
      app.exit(1);
    });
}
