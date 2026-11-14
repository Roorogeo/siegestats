import { app, Menu, nativeTheme, type BrowserWindow } from 'electron';
import appConfig from '@config/app.json';
import { createAppServices } from '@core/app-services';
import { normalizeSettings } from '@core/settings/defaults';
import { resolveActiveTheme } from '@shared/theme';
import type { AppConfig } from '@shared/types/game-config';
import { registerBridge } from './ipc/register';
import { detectRuntime } from './runtime/detect';
import { createElectronSettingsStore } from './settings/electron-settings-store';
import { externalLinks } from './system/links';
import { createMainWindow } from './window/main-window';

/**
 * Main process: wiring only. Product logic lives in src/core, UI in src/renderer;
 * this file connects them to Electron and owns nothing else.
 */
const APP_ID = 'app.sightline.desktop';

// E2E tests point the app at a throwaway profile so they never touch real settings.
if (process.env.SIGHTLINE_USER_DATA) app.setPath('userData', process.env.SIGHTLINE_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  const openMainWindow = (backgroundColor: string): void => {
    mainWindow = createMainWindow({ backgroundColor });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    // The frameless window has no menu bar, but Electron's default menu would still bind Ctrl+R (a full reload that
    // bypasses the in-app Refresh) and the developer-tools shortcuts. Keep them only while developing.
    if (app.isPackaged) Menu.setApplicationMenu(null);

    const settingsStore = createElectronSettingsStore();
    const core = createAppServices({
      info: { name: app.getName(), version: app.getVersion(), runtime: detectRuntime(), isDev: !app.isPackaged },
      config: appConfig as AppConfig,
      settingsStore,
      links: externalLinks,
    });
    registerBridge(core);

    // The window is painted in the saved theme's background before any UI exists.
    const saved = normalizeSettings(settingsStore.readSync());
    const theme = resolveActiveTheme(saved.theme, nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    openMainWindow(theme.tokens.bg);
  });
}
