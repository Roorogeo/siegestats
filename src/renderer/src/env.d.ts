/// <reference types="vite/client" />
import type { Bridge } from '@shared/types/bridge';

declare global {
  /** From package.json at build time; used only by the in-browser bridge. */
  const __APP_VERSION__: string;

  interface Window {
    /** Present under Electron (exposed by the preload). Absent in a plain browser. */
    bridge?: Bridge;
  }
}

export {};
