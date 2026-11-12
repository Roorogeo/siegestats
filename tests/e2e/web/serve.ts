import { test as base, expect } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';

const DIST = resolve('dist-web');
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};

/** Serves the built renderer (dist-web) on a free port for the duration of a worker. */
export const test = base.extend<object, { appUrl: string }>({
  appUrl: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist-web is missing. Run: npm run build:web');
      const server: Server = createServer((req, res) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const file = join(DIST, rel === '/' ? 'index.html' : rel);
        if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        createReadStream(file).pipe(res);
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      await use(`http://127.0.0.1:${port}`);
      server.close();
    },
    { scope: 'worker' },
  ],
});

export { expect };
