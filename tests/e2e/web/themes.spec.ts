import type { Locator, Page } from '@playwright/test';
import { expect, test as base } from './serve';

/** Every test also fails on any console error or uncaught exception in the page. */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

/** The brief: 6 generic themes, then 10 in each specialty category, in this tab order. */
const CATEGORIES: readonly [label: string, count: number][] = [
  ['Generic', 6],
  ['Elements', 10],
  ['Neon', 10],
  ['Nature', 10],
  ['Tactical and Tech', 10],
  ['Seasonal and Mood', 10],
];

const DISCLAIMER = 'Fan-made. Not affiliated with or endorsed by Ubisoft.';

async function open(page: Page, appUrl: string, route = '/settings/themes'): Promise<void> {
  await page.goto(`${appUrl}/#${route}`);
  await page.waitForSelector('#root > *');
}

const tab = (page: Page, label: string): Locator => page.getByRole('tab', { name: new RegExp(`^${label}`) });
const card = (page: Page, id: string): Locator => page.locator(`[data-theme-id="${id}"]`);
const activeTheme = (page: Page): Promise<string | undefined> => page.evaluate(() => document.documentElement.dataset.theme);
const cssVar = (page: Page, name: string): Promise<string> =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(), name);
const storedSettings = (page: Page): Promise<string> => page.evaluate(() => localStorage.getItem('sightline.settings') ?? '');

test('each category tab shows its themes, and only the open tab is mounted', async ({ page, appUrl }) => {
  await open(page, appUrl);
  await expect(page.getByRole('tablist', { name: 'Theme categories' })).toBeVisible();
  // Graphite is on screen by default, so Generic is the tab that opens.
  await expect(tab(page, 'Generic')).toHaveAttribute('aria-selected', 'true');

  let total = 0;
  for (const [label, count] of CATEGORIES) {
    await tab(page, label).click();
    await expect(tab(page, label)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').locator('[data-theme-id]')).toHaveCount(count);
    await expect(page.locator('[data-theme-id]')).toHaveCount(count);
    total += count;
  }
  expect(total).toBe(56);
});

test('the favourite star is a sibling of the card button, never inside it', async ({ page, appUrl }) => {
  await open(page, appUrl);
  await expect(card(page, 'graphite')).toBeVisible();
  await expect(page.locator('[data-theme-id] button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Graphite to favourites' })).toHaveAttribute('aria-pressed', 'false');
});

test('clicking a card applies the theme at once, without a reload, and it is saved', async ({ page, appUrl }) => {
  await open(page, appUrl);
  expect(await activeTheme(page)).toBe('graphite');
  const bgBefore = await cssVar(page, '--bg');
  // Survives anything but a reload.
  await page.evaluate(() => Object.assign(window, { __sameDocument: true }));

  await tab(page, 'Elements').click();
  await card(page, 'ember').click();

  // Read straight away: no waiting, no polling.
  expect(await activeTheme(page)).toBe('ember');
  expect(await cssVar(page, '--bg')).toBe('#140b08');
  expect(await cssVar(page, '--bg')).not.toBe(bgBefore);
  expect(await page.evaluate(() => '__sameDocument' in window)).toBe(true);
  await expect(card(page, 'ember')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'ember')).toContainText('In use');
  await expect(card(page, 'glacier')).toHaveAttribute('aria-pressed', 'false');

  await expect.poll(() => storedSettings(page)).toContain('"activeThemeId":"ember"');
  await page.reload();
  await page.waitForSelector('#root > *');
  expect(await page.evaluate(() => '__sameDocument' in window)).toBe(false);
  expect(await activeTheme(page)).toBe('ember');
  expect(await cssVar(page, '--bg')).toBe('#140b08');
  // The picker opens on the category of the theme on screen.
  await expect(tab(page, 'Elements')).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'ember')).toHaveAttribute('aria-pressed', 'true');
});

test('a starred theme appears on the Favorites tab and survives a reload', async ({ page, appUrl }) => {
  await open(page, appUrl);
  await tab(page, 'Favorites').click();
  await expect(page.getByText('Star a theme to keep it here.')).toBeVisible();
  await expect(page.getByRole('tabpanel').locator('[data-theme-id]')).toHaveCount(0);

  await tab(page, 'Elements').click();
  await page.getByRole('button', { name: 'Add Ember to favourites' }).click();
  const remove = page.getByRole('button', { name: 'Remove Ember from favourites' });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  // Starring does not apply the theme.
  expect(await activeTheme(page)).toBe('graphite');

  await tab(page, 'Favorites').click();
  await expect(tab(page, 'Favorites')).toContainText('1');
  await expect(page.getByRole('tabpanel').locator('[data-theme-id]')).toHaveCount(1);
  await expect(card(page, 'ember')).toBeVisible();

  await expect.poll(() => storedSettings(page)).toContain('"favoriteThemeIds":["ember"]');
  await page.reload();
  await page.waitForSelector('#root > *');
  await tab(page, 'Favorites').click();
  await expect(page.getByRole('tabpanel').locator('[data-theme-id]')).toHaveCount(1);
  await expect(card(page, 'ember')).toBeVisible();

  // Un-starring from the Favorites tab removes the card and leaves the empty state.
  await page.getByRole('button', { name: 'Remove Ember from favourites' }).click();
  await expect(page.getByText('Star a theme to keep it here.')).toBeVisible();
});

test('search runs across every category, from any tab', async ({ page, appUrl }) => {
  await open(page, appUrl);
  await expect(tab(page, 'Generic')).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'neon-district')).toHaveCount(0);

  const search = page.getByRole('searchbox', { name: 'Search themes' });
  await search.fill('neon');
  await expect(card(page, 'neon-district')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'results for' })).toHaveText('10 results for “neon”');
  // While searching, the tabs make way for the result count.
  await expect(page.getByRole('tablist', { name: 'Theme categories' })).toHaveCount(0);

  await search.fill('pitch');
  await expect(page.locator('[data-theme-id]')).toHaveCount(1);
  await expect(card(page, 'pitch-black')).toBeVisible();

  await search.fill('no such theme');
  await expect(page.getByText('No themes match “no such theme”')).toBeVisible();
  await expect(page.locator('[data-theme-id]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear search' }).first().click();
  await expect(search).toHaveValue('');
  await expect(tab(page, 'Generic')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-theme-id]')).toHaveCount(6);

  // Escape clears too.
  await search.fill('ember');
  await expect(page.locator('[data-theme-id]')).toHaveCount(1);
  await search.press('Escape');
  await expect(search).toHaveValue('');
});

test('Match Windows follows the system light/dark setting, and a specialty pick turns it off', async ({ page, appUrl }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, appUrl);
  const toggle = page.getByRole('switch', { name: 'Match Windows light/dark' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await activeTheme(page)).toBe('graphite');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await activeTheme(page)).toBe('daylight');
  await expect(page.getByText('Windows is in light mode: using Daylight. Dark mode uses Graphite.')).toBeVisible();
  await expect(card(page, 'daylight')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'daylight')).toContainText('Windows light');
  await expect(card(page, 'graphite')).toContainText('Windows dark');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => activeTheme(page)).toBe('graphite');
  await expect(page.getByText('Windows is in dark mode: using Graphite. Light mode uses Daylight.')).toBeVisible();

  // A dark generic theme becomes the dark half of the pair.
  await card(page, 'midnight').click();
  expect(await activeTheme(page)).toBe('midnight');
  await expect(card(page, 'midnight')).toContainText('Windows dark');
  await expect(card(page, 'graphite')).not.toContainText('Windows dark');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // A specialty theme cannot follow Windows: picking one switches matching off, visibly.
  await tab(page, 'Neon').click();
  await card(page, 'neon-district').click();
  expect(await activeTheme(page)).toBe('neon-district');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText("Match Windows turned off: specialty themes don't follow Windows.")).toBeVisible();

  // And the system setting no longer moves the theme.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.getByText('Follow the Windows light/dark setting with a pair of generic themes.')).toBeVisible();
  expect(await activeTheme(page)).toBe('neon-district');
});

test('the picker works from the keyboard', async ({ page, appUrl }) => {
  await open(page, appUrl);
  const search = page.getByRole('searchbox', { name: 'Search themes' });
  await search.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('switch', { name: 'Match Windows light/dark' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(tab(page, 'Generic')).toBeFocused();

  // Arrow keys move between tabs, and the focus moves with the selection.
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Elements')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Elements')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(card(page, 'ember')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add Ember to favourites' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(card(page, 'glacier')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await activeTheme(page)).toBe('glacier');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Remove Ember from favourites' })).toBeFocused();
});

test('settings sections are links; unknown sections fall back to Themes', async ({ page, appUrl }) => {
  await open(page, appUrl, '/settings');
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Themes' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Hotkeys' }).click();
  await expect(page).toHaveURL(/#\/settings\/hotkeys$/);
  await expect(nav.getByRole('link', { name: 'Hotkeys' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Themes' })).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('arrives in phase 6')).toBeVisible();

  await open(page, appUrl, '/settings/not-a-section');
  await expect(nav.getByRole('link', { name: 'Themes' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('searchbox', { name: 'Search themes' })).toBeVisible();
});

test('About carries the exact Ubisoft disclaimer', async ({ page, appUrl }) => {
  await open(page, appUrl, '/settings/about');
  await expect(page.getByText(DISCLAIMER, { exact: true })).toBeVisible();
  await expect(page.getByText('sends no telemetry unless you opt in')).toBeVisible();
  const about = page.getByRole('region', { name: 'About' });
  await expect(about.getByRole('button', { name: 'Report a bug' })).toBeVisible();
  await expect(about.getByRole('term').filter({ hasText: 'Version' })).toBeVisible();
});
