import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

test('the packaged app has the player route but not the development gallery', async () => {
  const { page, close } = await launchApp();
  try {
    await page.evaluate(() => {
      window.location.hash = '#/player/pc/some-account';
    });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Player profile');

    // /dev/components exists only in the dev server and the browser build: here it falls through to Home.
    await page.evaluate(() => {
      window.location.hash = '#/dev/components';
    });
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home');
  } finally {
    await close();
  }
});
