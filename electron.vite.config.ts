import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cspPlugin } from './build/csp.ts';
import pkg from './package.json' with { type: 'json' };

/**
 * The app runs on Overwolf's Electron build (@overwolf/ow-electron), not the vanilla electron package.
 * electron-vite normally finds the binary and the Electron major version through the electron package,
 * so both are taken from ow-electron instead: its package.json carries the Electron version it is built on,
 * and requiring it returns the path of its binary (downloading it first if needed).
 */
const require = createRequire(import.meta.url);
const owElectron = JSON.parse(readFileSync(require.resolve('@overwolf/ow-electron/package.json'), 'utf8')) as {
  electronVersion: string;
};
process.env.ELECTRON_MAJOR_VER ??= owElectron.electronVersion.split('.')[0];
process.env.ELECTRON_EXEC_PATH ??= require('@overwolf/ow-electron') as string;

const define = { __APP_VERSION__: JSON.stringify(pkg.version), __WEB_BUILD__: JSON.stringify(false) };

export default defineConfig({
  main: {
    resolve: { tsconfigPaths: true },
  },
  preload: {
    resolve: { tsconfigPaths: true },
    // A sandboxed preload must be one self-contained CommonJS file.
    build: {
      externalizeDeps: false,
      rolldownOptions: { output: { format: 'cjs' } },
    },
  },
  renderer: {
    define,
    resolve: { tsconfigPaths: true },
    plugins: [react(), tailwindcss(), cspPlugin()],
  },
});
