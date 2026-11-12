import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { CoreBridge } from '@core/app-services';
import type { IpcResult } from '@shared/types/bridge';
import {
  BRIDGE_MANIFEST, IPC_EVENT, IPC_INVOKE, isBridgeCall, isBridgeNamespace, type BridgeNamespace,
} from '@shared/ipc/manifest';
import { appError, toAppError } from '@shared/util/errors';

type AnyFn = (...args: unknown[]) => unknown;

/** Calls on the sender's own window. They live here because core knows nothing about windows. */
const windowCalls: Record<string, (win: BrowserWindow) => unknown> = {
  minimize: (win) => win.minimize(),
  toggleMaximize: (win) => (win.isMaximized() ? win.unmaximize() : win.maximize()),
  close: (win) => win.close(),
  isMaximized: (win) => win.isMaximized(),
};

/** Only our own page may use the bridge: the built index.html, or the dev server while developing. */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) return url.startsWith(devUrl);
  try {
    const page = fileURLToPath(new URL(url.split('#')[0] ?? ''));
    return page === join(import.meta.dirname, '../renderer/index.html');
  } catch {
    return false;
  }
}

/**
 * Exposes core over IPC. One generic handler: the manifest decides what may be called, the reply is
 * always an IpcResult, and errors travel as plain AppError objects (a thrown Error would lose its code).
 */
export function registerBridge(core: CoreBridge): void {
  ipcMain.handle(IPC_INVOKE, async (event, ns: unknown, method: unknown, args: unknown): Promise<IpcResult<unknown>> => {
    try {
      if (!isTrustedSender(event)) throw appError('unknown', 'Call from an untrusted page was refused.');
      if (!isBridgeNamespace(ns) || !isBridgeCall(ns, method)) throw appError('unsupported', 'Unknown bridge call.');
      const list = Array.isArray(args) ? args : [];
      if (ns === 'window') {
        const win = BrowserWindow.fromWebContents(event.sender);
        const call = windowCalls[method];
        if (!win || !call) throw appError('unknown', 'No window for this call.');
        return { ok: true, value: (await call(win)) ?? undefined };
      }
      const target = (core[ns] as unknown as Record<string, AnyFn>)[method];
      if (typeof target !== 'function') throw appError('unsupported', 'Unknown bridge call.');
      return { ok: true, value: await target(...list) };
    } catch (error) {
      return { ok: false, error: toAppError(error) };
    }
  });

  // Every core event is forwarded to every window; the preload hands it to the subscribers there.
  for (const ns of Object.keys(BRIDGE_MANIFEST) as BridgeNamespace[]) {
    if (ns === 'window') continue;
    for (const name of BRIDGE_MANIFEST[ns].events) {
      const subscribe = (core[ns] as unknown as Record<string, AnyFn>)[name];
      if (typeof subscribe !== 'function') continue;
      subscribe((...payload: unknown[]) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(IPC_EVENT, ns, name, payload);
        }
      });
    }
  }
}
