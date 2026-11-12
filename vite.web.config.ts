import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cspPlugin } from './build/csp.ts';
import pkg from './package.json' with { type: 'json' };

const define = { __APP_VERSION__: JSON.stringify(pkg.version) };

/** The renderer on its own, in a plain browser, with the in-page bridge. For development and tests. */
export default defineConfig({
  root: 'src/renderer',
  base: './',
  define,
  resolve: { tsconfigPaths: true },
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: { outDir: '../../dist-web', emptyOutDir: true },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
