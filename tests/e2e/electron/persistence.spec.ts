import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

test('a theme change applies at once, is saved, and is restored on the next launch', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'sightline-e2e-persist-'));
  try {
    const first = await launchApp(userData);
    const before = await first.page.evaluate(() => document.documentElement.dataset.theme);
    expect(before).toBe('graphite');

    // Change the theme the way the UI does: through the bridge. No reload happens.
    await first.page.evaluate(() => {
      (window as unknown as { __marker: string }).__marker = 'same-page';
      return window.bridge!.settings.update({ theme: { activeThemeId: 'ember' as never } });
    });
    await expect.poll(() => first.page.evaluate(() => document.documentElement.dataset.theme)).toBe('ember');
    expect(await first.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#140B08');
    expect(await first.page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('same-page');
    await first.app.close();

    const saved = JSON.parse(await readFile(join(userData, 'settings.json'), 'utf8')) as { settings: { theme: { activeThemeId: string } } };
    expect(saved.settings.theme.activeThemeId).toBe('ember');

    const second = await launchApp(userData);
    expect(await second.page.evaluate(() => document.documentElement.dataset.theme)).toBe('ember');
    // The window itself is painted in the saved theme before the page loads.
    const background = await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor());
    expect(background.toUpperCase()).toBe('#140B08');
    await second.app.close();
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});

test('window size and position are remembered', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'sightline-e2e-bounds-'));
  try {
    const first = await launchApp(userData);
    await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ x: 60, y: 40, width: 1333, height: 777 }));
    await first.page.waitForTimeout(400);
    await first.app.close();

    const second = await launchApp(userData);
    const bounds = await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds());
    expect(bounds.width).toBe(1333);
    expect(bounds.height).toBe(777);
    await second.app.close();
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});

test('a second launch focuses the running app instead of opening another', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'sightline-e2e-single-'));
  try {
    const first = await launchApp(userData);
    const lockHeld = await first.app.evaluate(({ app }) => app.hasSingleInstanceLock());
    expect(lockHeld).toBe(true);
    await first.app.close();
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});
