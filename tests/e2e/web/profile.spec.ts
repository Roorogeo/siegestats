import type { Page } from '@playwright/test';
import { expect, test } from './serve';

/**
 * Player profile and My Profile on the mock data. The accounts below come from the seeded mock world: they depend
 * only on MOCK_SEED and the game config, never on the clock, so they are the same on every run.
 *   LuhalAlt (PC): a full ranked season; the source links one PlayStation account, nothing on Xbox.
 */
const PLAYER = { platform: 'pc', id: '17c92055-6505-482b-922b-f80b5a5c03a1', name: 'LuhalAlt' } as const;
const LINKED = { platform: 'psn', id: 'bdd96aff-fd72-4267-8ab6-69cd3addfe20' } as const;
const profileRoute = (p: { platform: string; id: string }, search = ''): string => `/player/${p.platform}/${p.id}${search}`;

/** Opens the app on a fresh page and collects every console error and uncaught exception. */
async function open(page: Page, appUrl: string, route: string): Promise<string[]> {
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
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Profile sections' });
const updated = (page: Page) => page.getByTestId('profile-updated');
/** Waits for the profile's data, not its skeleton. */
const loaded = async (page: Page, name: string = PLAYER.name): Promise<void> => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
};

test('a profile opens from its link with name, level and the "updated" label, and fits the smallest window', async ({ page, appUrl }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const errors = await open(page, appUrl, profileRoute(PLAYER));
  await loaded(page);
  const header = page.locator('main header').filter({ has: page.getByRole('heading', { level: 1 }) });
  await expect(header).toContainText(/Level \d+/);
  await expect(header).toContainText(/Last played /);
  await expect(updated(page)).toHaveText('Updated just now');
  await expect(updated(page)).toHaveAttribute('data-from', 'source');

  // Overview: current season, peak ranks and the ranked sessions chart, each with real data.
  const season = page.getByRole('region', { name: 'Current season' });
  await expect(season.getByRole('group', { name: 'K/D' })).toContainText(/\d\.\d\d/);
  await expect(season.getByRole('table', { name: 'This season by playlist' }).locator('tbody tr')).toHaveCount(3);
  const peaks = page.getByRole('region', { name: 'Peak ranks' });
  await expect(peaks.getByRole('img', { name: /RP$/ }).first()).toBeVisible();
  await peaks.getByRole('radio', { name: 'Final' }).click();
  await expect(peaks).toContainText('Ranked rank each season ended on');
  await expect(page.getByRole('figure', { name: 'Ranked points after every match' }).locator('.recharts-line-curve')).toBeVisible();

  // No horizontal scroll in the page at the minimum window size.
  const overflow = await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the selected tab lives in the URL and the tabs work from the keyboard', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(PLAYER));
  await loaded(page);
  const overview = tabs(page).getByRole('tab', { name: 'Overview' });
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();

  await tabs(page).getByRole('tab', { name: 'Seasons' }).click();
  await expect.poll(() => hashOf(page)).toMatch(/\?tab=seasons$/);
  await expect(page.getByRole('tabpanel', { name: 'Seasons' })).toBeVisible();

  // Arrow keys and End move the selection and the focus, and each step is in the URL.
  await page.keyboard.press('ArrowRight');
  const encounters = tabs(page).getByRole('tab', { name: 'Encounters' });
  await expect(encounters).toBeFocused();
  await expect(encounters).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => hashOf(page)).toMatch(/\?tab=encounters$/);
  await page.keyboard.press('End');
  await expect(tabs(page).getByRole('tab', { name: 'Linked accounts' })).toBeFocused();
  await expect.poll(() => hashOf(page)).toMatch(/\?tab=linked$/);

  // Back and forward follow the tabs.
  await page.goBack();
  await expect(encounters).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(tabs(page).getByRole('tab', { name: 'Seasons' })).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(encounters).toHaveAttribute('aria-selected', 'true');

  // A link straight to a tab opens it; an unknown tab falls back to Overview.
  await page.goto(`${appUrl}/#${profileRoute(PLAYER, '?tab=maps')}`);
  await expect(tabs(page).getByRole('tab', { name: 'Maps' })).toHaveAttribute('aria-selected', 'true');
  await page.goto(`${appUrl}/#${profileRoute(PLAYER, '?tab=nonsense')}`);
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('Pin as mine makes My Profile show the player and lists it in the account switcher; Unpin undoes it', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/profile');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Profile');
  await expect(page.getByText('Find your account and pin it')).toBeVisible();

  await page.goto(`${appUrl}/#${profileRoute(PLAYER)}`);
  await loaded(page);
  const pin = page.getByRole('button', { name: 'Pin as mine' });
  await pin.click();
  await expect(page.getByRole('status').filter({ hasText: 'Pinned as mine' })).toBeVisible();
  // The same button now unpins, and keeps the focus.
  await expect(page.getByRole('button', { name: 'Unpin' })).toBeFocused();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My Profile' }).click();
  await expect.poll(() => hashOf(page)).toBe('#/profile');
  await loaded(page);
  await expect(page.getByText('Your account', { exact: true })).toBeVisible();

  const switcher = page.getByRole('button', { name: `My accounts: ${PLAYER.name}` });
  await switcher.click();
  await expect(page.getByRole('list', { name: 'Pinned accounts' })).toContainText(PLAYER.name);
  await page.keyboard.press('Escape');

  // Unpinning the only account brings the onboarding back.
  await page.getByRole('button', { name: 'Unpin' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Profile');
  await expect(page.getByText('Find your account and pin it')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the favourite star toggles and stays set for the session', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(PLAYER));
  await loaded(page);
  await page.getByRole('button', { name: `Add ${PLAYER.name} to favourites` }).click();
  const remove = page.getByRole('button', { name: `Remove ${PLAYER.name} from favourites` });
  await expect(remove).toBeVisible();
  await expect(remove).toBeFocused();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home');
  await page.goBack();
  await loaded(page);
  await expect(page.getByRole('button', { name: `Remove ${PLAYER.name} from favourites` })).toBeVisible();

  await page.getByRole('button', { name: `Remove ${PLAYER.name} from favourites` }).click();
  await expect(page.getByRole('button', { name: `Add ${PLAYER.name} to favourites` })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Update fetches the player again from the source, past the saved copy', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(PLAYER));
  await loaded(page);
  await expect(updated(page)).toHaveAttribute('data-from', 'source');

  // Leave and come back: core answers from its 5-minute cache.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home');
  await page.goBack();
  await loaded(page);
  await expect(updated(page)).toHaveAttribute('data-from', 'cache');

  const update = page.getByRole('button', { name: 'Update' });
  await update.click();
  // While it runs the button says so and cannot be pressed again.
  const running = page.getByRole('button', { name: 'Updating' });
  await expect(running).toBeDisabled();
  await expect(updated(page)).toHaveAttribute('data-from', 'source', { timeout: 15_000 });
  await expect(updated(page)).toHaveText('Updated just now');
  await expect(page.getByRole('button', { name: 'Update' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('the platform switch opens a linked account and offers a search on an unlinked platform', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(PLAYER, '?tab=seasons'));
  await loaded(page);
  const platforms = page.getByRole('group', { name: 'Platform' });
  await expect(platforms.locator('[aria-current="page"]')).toHaveText('PC');
  await expect(page.getByText('1 linked account')).toBeVisible();

  // An unlinked platform is focusable, explains itself and offers an ordinary search for the same name.
  const xbox = platforms.getByRole('button', { name: 'Xbox, no linked account' });
  await xbox.click();
  const panel = page.getByRole('dialog', { name: 'Xbox: no linked account' });
  await expect(panel).toContainText(`The stats source links no Xbox account to ${PLAYER.name}`);
  const search = panel.getByRole('button', { name: `Search “${PLAYER.name}” on Xbox` });
  await expect(search).toBeFocused();
  await search.click();
  await expect(panel).toBeHidden();
  await xbox.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(xbox).toBeFocused();

  // A linked platform opens that account, on the same tab, and links back.
  await platforms.getByRole('link', { name: /^PlayStation: .+, linked account$/ }).click();
  await expect.poll(() => hashOf(page)).toBe(`#${profileRoute(LINKED, '?tab=seasons')}`);
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(PLAYER.name, { timeout: 15_000 });
  await expect(platforms.locator('[aria-current="page"]')).toHaveText('PlayStation');
  await expect(tabs(page).getByRole('tab', { name: 'Seasons' })).toHaveAttribute('aria-selected', 'true');
  await platforms.getByRole('link', { name: `PC: ${PLAYER.name}, linked account` }).click();
  await loaded(page);
  expect(errors).toEqual([]);
});

test('an unknown player and a malformed link get a not-found page with a search', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/player/pc/no-such-account');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Player not found', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Search for the player' })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);

  await page.goto(`${appUrl}/#/player/switch/abc`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This player link is not valid');
  await expect(page.getByRole('button', { name: 'Search for the player' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the ranked sessions chart expands into a modal dialog that Escape closes, returning focus', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(PLAYER));
  await loaded(page);
  const card = page.getByRole('region', { name: 'Ranked sessions' });
  const expand = card.getByRole('button', { name: 'Expand' });
  await expect(expand).toBeVisible({ timeout: 15_000 });
  await expand.click();

  const dialog = page.getByRole('dialog', { name: 'Ranked sessions' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('figure', { name: 'Ranked points after every match, full size' }).locator('.recharts-line-curve')).toBeVisible();
  const close = dialog.getByRole('button', { name: 'Close' });
  await expect(close).toBeFocused();

  // Focus stays inside the dialog in both directions.
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();

  // The Close button works the same way.
  await expand.click();
  await page.getByRole('dialog', { name: 'Ranked sessions' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Ranked sessions' })).toBeHidden();
  await expect(expand).toBeFocused();
  expect(errors).toEqual([]);
});
