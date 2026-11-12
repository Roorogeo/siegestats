import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cspPlugin } from './build/csp.ts';
import pkg from './package.json' with { type: 'json' };

const define = { __APP_VERSION__: JSON.stringify(pkg.version) };

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
