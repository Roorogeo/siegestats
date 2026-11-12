import { expect, test } from './serve';

test('the renderer runs in a plain browser on the in-page bridge', async ({ page, appUrl }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${appUrl}/#/`);
  await page.waitForSelector('#root > *');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('graphite');
  expect(await page.evaluate(() => typeof window.bridge)).toBe('undefined');
  expect(errors).toEqual([]);
});
