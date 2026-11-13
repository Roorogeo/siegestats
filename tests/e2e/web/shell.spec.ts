import type { Page } from '@playwright/test';
import { expect, test } from './serve';

const TABS = [
  { name: 'Home', hash: '#/' },
  { name: 'Leaderboards', hash: '#/leaderboards' },
  { name: 'Legend Division', hash: '#/legend-division' },
  { name: 'My Profile', hash: '#/profile' },
  { name: 'Live Match', hash: '#/live' },
];

/** Opens the app on a fresh page and collects every console error and uncaught exception. */
async function open(page: Page, appUrl: string, route = '/'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${appUrl}/#${route}`);
  await page.waitForSelector('#root > *');
  return errors;
}

const hashOf = (page: Page): string => new URL(page.url()).hash;
const tabLinks = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('link');
const search = (page: Page) => page.getByRole('combobox', { name: 'Search players' });

test('the five tabs exist in the order of the brief and navigate', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  await expect(tabLinks(page)).toHaveText(TABS.map((tab) => tab.name));

  for (const tab of [...TABS.slice(1), TABS[0]!]) {
    await tabLinks(page).filter({ hasText: tab.name }).click();
    await expect.poll(() => hashOf(page)).toBe(tab.hash);
    await expect(page.getByRole('link', { name: tab.name, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab.name);
    // Only the open tab is current.
    await expect(tabLinks(page).and(page.locator('[aria-current="page"]'))).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('Ctrl+K focuses the search from the page, also from another field; Escape closes and leaves it', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  await page.locator('main').click();
  await expect(search(page)).not.toBeFocused();

  await page.keyboard.press('Control+k');
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveAttribute('aria-expanded', 'true');
  const suggestions = page.getByRole('listbox', { name: 'Search suggestions' });
  await expect(suggestions).toContainText('Accounts you pin as yours appear here');
  await expect(suggestions).toContainText('Players you look up appear here');

  await page.keyboard.type('Pengu');
  await expect(suggestions).toContainText('Player search arrives in phase 2');

  await page.keyboard.press('Escape');
  await expect(suggestions).toBeHidden();
  await expect(search(page)).not.toBeFocused();

  // From another text field (the platform picker inside the search counts as one), Ctrl+K still wins.
  await page.getByRole('combobox', { name: 'Platform to search' }).focus();
  await page.keyboard.press('Control+k');
  await expect(search(page)).toBeFocused();
  expect(await search(page).evaluate((input: HTMLInputElement) => (input.selectionEnd ?? 0) - (input.selectionStart ?? 0))).toBe('Pengu'.length);
  expect(errors).toEqual([]);
});

test('Alt+Left / Alt+Right move through history and the back and forward buttons follow', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  const back = page.getByRole('button', { name: 'Back', exact: true });
  const forward = page.getByRole('button', { name: 'Forward', exact: true });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();

  await tabLinks(page).filter({ hasText: 'Leaderboards' }).click();
  await tabLinks(page).filter({ hasText: 'Legend Division' }).click();
  await expect.poll(() => hashOf(page)).toBe('#/legend-division');
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

  await page.locator('main').click();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe('#/leaderboards');
  await expect(forward).toBeEnabled();

  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe('#/');
  await expect(back).toBeDisabled();
  // Nothing before the first entry: another Alt+Left stays in the app.
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe('#/');

  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => hashOf(page)).toBe('#/legend-division');
  await expect(forward).toBeDisabled();
  await expect(back).toBeEnabled();

  // The title-bar buttons do the same.
  await back.click();
  await expect.poll(() => hashOf(page)).toBe('#/leaderboards');
  await forward.click();
  await expect.poll(() => hashOf(page)).toBe('#/legend-division');

  // And so do the mouse's side buttons (3 = back, 4 = forward).
  const mouseUp = (button: number) => page.evaluate((b) => window.dispatchEvent(new MouseEvent('mouseup', { button: b })), button);
  await mouseUp(3);
  await expect.poll(() => hashOf(page)).toBe('#/leaderboards');
  await mouseUp(4);
  await expect.poll(() => hashOf(page)).toBe('#/legend-division');
  expect(errors).toEqual([]);
});

test('refresh re-fetches in place: no page reload, no navigation', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/leaderboards');
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  const refresh = page.getByRole('button', { name: 'Refresh' });
  await refresh.click();
  await expect(refresh).toHaveAttribute('aria-busy', 'true');
  await expect(refresh).toHaveAttribute('aria-busy', 'false');
  expect(hashOf(page)).toBe('#/leaderboards');
  expect(await page.evaluate(() => 'sameDocument' in window)).toBe(true);
  expect(errors).toEqual([]);
});

test('"Report a bug" opens the configured link, and a failure shows a note instead of a dialog', async ({ page, appUrl }) => {
  // Record what the in-page bridge asks the browser to open; the second call fails.
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.assign(window, { opened });
    window.open = (url?: string | URL) => {
      opened.push(String(url));
      if (opened.length > 1) throw new Error('blocked');
      return null;
    };
  });
  const errors = await open(page, appUrl);
  page.on('dialog', () => errors.push('a dialog was shown'));
  const report = page.getByRole('button', { name: 'Report a bug' });

  await report.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([
    'https://github.com/Roorogeo/siegestats/issues/new',
  ]);
  await expect(page.getByRole('alert')).toBeEmpty();

  await report.click();
  await expect(page.getByRole('alert')).toContainText('The link could not be opened');
  // The community link has no URL in config/app.json, so it is not offered.
  await expect(page.getByRole('button', { name: 'Community' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the settings button opens the settings route and shows it as current', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  const settings = page.getByRole('link', { name: 'Settings', exact: true });
  await expect(settings).not.toHaveAttribute('aria-current', 'page');
  await settings.click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/settings(\/|$)/);
  await expect(settings).toHaveAttribute('aria-current', 'page');
  // No tab is current on a page that is not a tab.
  await expect(tabLinks(page).and(page.locator('[aria-current="page"]'))).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the notifications popover opens with its two tabs and Escape returns focus to the bell', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  const bell = page.getByRole('button', { name: 'Notifications', exact: true });
  await expect(bell).toHaveAttribute('aria-expanded', 'false');

  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications and favourites' });
  await expect(panel).toBeVisible();
  await expect(bell).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('tab')).toHaveText(['Notifications', 'Favourites']);
  await expect(panel).toContainText('Nothing yet');
  // Focus moved into the panel, onto the selected tab; the arrow keys move between the two tabs.
  await expect(panel.getByRole('tab', { name: 'Notifications' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('tab', { name: 'Favourites' })).toBeFocused();
  await expect(panel.getByRole('tab', { name: 'Favourites' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toContainText('Players you star appear here');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
  await expect(bell).toHaveAttribute('aria-expanded', 'false');

  // A click outside closes it too.
  await bell.click();
  await expect(panel).toBeVisible();
  await page.locator('main').click({ position: { x: 20, y: 400 } });
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('the account switcher shows the honest empty state', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  const trigger = page.getByRole('button', { name: 'My accounts: No account' });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'My accounts' });
  await expect(panel).toContainText('Pin an account as yours from its profile. Pinning arrives in phase 2.');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('the account switcher lists pinned accounts and switches the active one', async ({ page, appUrl }) => {
  const account = (id: string, name: string, platform: string) => ({
    player: { platform, id, name, avatarUrl: null },
    pinnedAt: '2026-11-01T10:00:00.000Z',
  });
  const seeded = {
    accounts: { mock: { pinned: [account('p1', 'Ash.Main', 'pc'), account('p2', 'Thermite.Alt', 'psn')], active: { platform: 'pc', id: 'p1' } } },
  };
  await page.addInitScript((json) => {
    if (!window.localStorage.getItem('sightline.settings')) window.localStorage.setItem('sightline.settings', json);
  }, JSON.stringify(seeded));
  const errors = await open(page, appUrl);

  const trigger = page.getByRole('button', { name: 'My accounts: Ash.Main' });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'My accounts' });
  await expect(panel.getByRole('button', { name: /Ash\.Main/ })).toHaveAttribute('aria-current', 'true');
  await panel.getByRole('button', { name: /Thermite\.Alt/ }).click();

  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'My accounts: Thermite.Alt' })).toBeFocused();
  // Saved, so it survives a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'My accounts: Thermite.Alt' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the shell never scrolls and has no horizontal overflow at the minimum window size', async ({ page, appUrl }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const errors = await open(page, appUrl);
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ x: 0, y: 0 });
  // In a browser there is no window to control.
  await expect(page.getByRole('button', { name: 'Minimize' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
