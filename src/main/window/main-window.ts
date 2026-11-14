import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import iconIco from '../../../resources/icon.ico?asset';
import iconPng from '../../../resources/icon.png?asset';
import { IPC_EVENT } from '@shared/ipc/manifest';

/** The Vite dev server, while developing. A packaged app never loads anything but its own files. */
export const rendererDevUrl = (): string | undefined => (app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL);

export const MIN_WIDTH = 1100;
export const MIN_HEIGHT = 700;

export interface MainWindowOptions {
  /** Painted before the UI loads, so start-up never flashes the wrong colour. */
  backgroundColor: string;
}

/** The frameless main window. Size and position are remembered by Electron's window-state persistence. */
export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    name: 'main',
    windowStatePersistence: true,
    width: 1280,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    show: false,
    backgroundColor: options.backgroundColor,
    icon: process.platform === 'win32' ? iconIco : iconPng,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  const pushMaximized = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC_EVENT, 'window', 'onMaximizedChange', [win.isMaximized()]);
  };
  win.on('maximize', pushMaximized);
  win.on('unmaximize', pushMaximized);

  // The app is a single page: nothing may navigate the window away or open new ones.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const devUrl = rendererDevUrl();
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));

  return win;
}
