import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge, IpcResult } from '@shared/types/bridge';
import { BRIDGE_MANIFEST, IPC_EVENT, IPC_INVOKE } from '@shared/ipc/manifest';

/**
 * Builds window.bridge from the manifest: every call goes through one IPC channel and comes back
 * as an IpcResult; every event arrives on one channel and is fanned out to subscribers here.
 * Nothing else from Electron or Node is exposed to the page.
 */
type Listener = (...payload: unknown[]) => void;
const listeners = new Map<string, Set<Listener>>();

ipcRenderer.on(IPC_EVENT, (_event, ns: string, name: string, payload: unknown[]) => {
  listeners.get(`${ns}.${name}`)?.forEach((listener) => listener(...(Array.isArray(payload) ? payload : [])));
});

const bridge: Record<string, Record<string, unknown>> = {};

for (const [ns, members] of Object.entries(BRIDGE_MANIFEST)) {
  const api: Record<string, unknown> = {};
  for (const method of members.calls) {
    api[method] = async (...args: unknown[]): Promise<unknown> => {
      const result = (await ipcRenderer.invoke(IPC_INVOKE, ns, method, args)) as IpcResult<unknown>;
      if (result.ok) return result.value;
      throw result.error; // a plain AppError object: it crosses the context bridge intact
    };
  }
  for (const event of members.events) {
    api[event] = (listener: Listener): (() => void) => {
      const key = `${ns}.${event}`;
      const set = listeners.get(key) ?? new Set<Listener>();
      listeners.set(key, set);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    };
  }
  bridge[ns] = api;
}

contextBridge.exposeInMainWorld('bridge', bridge as unknown as Bridge);
