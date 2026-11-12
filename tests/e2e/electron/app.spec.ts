import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

test('starts frameless at a usable size with a locked-down page', async () => {
  const { app, page, close } = await launchApp();
  try {
    const win = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      return { minimum: w.getMinimumSize(), size: w.getSize() };
    });
    expect(win.minimum).toEqual([1100, 700]);
    expect(win.size[0]).toBeGreaterThanOrEqual(1100);
    expect(win.size[1]).toBeGreaterThanOrEqual(700);

    // The page sees the bridge and nothing of Node.
    const page_ = await page.evaluate(() => ({
      bridge: Object.keys(window.bridge ?? {}).sort(),
      hasRequire: typeof (window as unknown as { require?: unknown }).require,
      hasProcess: typeof (window as unknown as { process?: unknown }).process,
    }));
    expect(page_.bridge).toEqual(
      ['app', 'data', 'favorites', 'live', 'notifications', 'overlay', 'searches', 'settings', 'stats', 'trends', 'window'],
    );
    expect(page_.hasRequire).toBe('undefined');
    expect(page_.hasProcess).toBe('undefined');

    const info = await page.evaluate(() => window.bridge!.app.getInfo());
    expect(info.name).toBe('Sightline');
    expect(info.runtime).toBe('electron');
  } finally {
    await close();
  }
});

test('the default theme is applied before first paint', async () => {
  const { page, close } = await launchApp();
  try {
    const theme = await page.evaluate(() => ({
      id: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(theme.id).toBe('graphite');
    expect(theme.bg).toBe('#111315');
    expect(theme.body).toBe('rgb(17, 19, 21)');
  } finally {
    await close();
  }
});

test('calls that are not on the bridge manifest are refused, errors keep their code', async () => {
  const { page, close } = await launchApp();
  try {
    const error = await page.evaluate(() =>
      window.bridge!.overlay.toggle().then(
        () => null,
        (e: unknown) => e,
      ),
    );
    expect(error).toMatchObject({ code: 'unsupported' });
  } finally {
    await close();
  }
});
