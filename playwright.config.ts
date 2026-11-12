import { defineConfig } from '@playwright/test';

/**
 * Two ways to run the same UI:
 *   electron  the real app (needs `npm run build`; on headless Linux run under xvfb-run)
 *   web       the renderer in a browser with the in-page bridge (needs `npm run build:web`; the tests serve dist-web themselves)
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'off' },
  projects: [
    { name: 'electron', testMatch: /electron\/.*\.spec\.ts/ },
    {
      name: 'web',
      testMatch: /web\/.*\.spec\.ts/,
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
