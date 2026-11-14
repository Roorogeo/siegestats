/// <reference types="vite/client" />
import type { Bridge } from '@shared/types/bridge';

declare global {
  /** From package.json at build time; used only by the in-browser bridge. */
  const __APP_VERSION__: string;
  /** True in the browser build (vite.web.config.ts), false in the Electron build. */
  const __WEB_BUILD__: boolean;

  interface Window {
    /** Present under Electron (exposed by the preload). Absent in a plain browser. */
    bridge?: Bridge;
  }
}

export {};
