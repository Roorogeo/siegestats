import { expect, test } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

test('makes no network request on its own ("no telemetry unless I opt in")', async () => {
  // Every request Chromium makes goes to this proxy; it records and refuses them.
  const requests: string[] = [];
  const proxy: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.writeHead(403).end();
  });
  proxy.on('connect', (req, socket) => {
    requests.push(`CONNECT ${req.url}`);
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done));
  const { port } = proxy.address() as AddressInfo;
  const { page, close } = await launchApp(undefined, [`--proxy-server=http://127.0.0.1:${port}`, '--proxy-bypass-list=<-loopback>']);
  try {
    for (const route of ['/', '/leaderboards', '/legend-division', '/profile', '/live', '/settings/themes', '/settings/about']) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route);
    }
    await page.waitForTimeout(6_000);
    expect(requests).toEqual([]);
  } finally {
    await close();
    proxy.close();
  }
});

test('the production page can load nothing but its own files', async () => {
  const { page, close } = await launchApp();
  try {
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    // A local file is not reachable from the page, even though the page itself is a local file.
    const fetched = await page.evaluate(() =>
      fetch(document.location.href).then(
        () => 'loaded',
        () => 'blocked',
      ),
    );
    expect(fetched).toBe('blocked');
  } finally {
    await close();
  }
});

test('a corrupted settings file falls back to defaults instead of failing to start', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'sightline-e2e-corrupt-'));
  try {
    await writeFile(join(userData, 'settings.json'), '{ this is not json');
    const { page, close } = await launchApp(userData);
    try {
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('graphite');
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    } finally {
      await close();
    }
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});
