import type { Locator, Page } from '@playwright/test';
import { expect, test } from './serve';

/**
 * The title bar's player search and the inline search of My Profile's onboarding, on the mock data. The handles
 * typed below are generator words ("otter", "quiet" are in the mock's word lists); the names checked are read off
 * the results themselves, so nothing depends on a particular account except LuhalAlt (PC), the profile used by the
 * profile tests, whose source links no Xbox account.
 */
const LUHAL = { platform: 'pc', id: '17c92055-6505-482b-922b-f80b5a5c03a1', name: 'LuhalAlt' } as const;

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

/**
 * Makes the in-page stats source fail the next `times` player searches with `error`, by serving a wrapper in place of
 * the browser bridge's module: the browser build has no other seam, and nothing here touches the app's own code.
 */
async function failSearches(page: Page, error: { code: string; message: string }, times: number): Promise<void> {
  await page.addInitScript(([e, n]) => Object.assign(window, { searchFailure: { error: e, left: n } }), [error, times] as const);
  await page.route(/\/assets\/browser-bridge-[^/?]+\.js$/, async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    await route.fulfill({
      contentType: 'text/javascript',
      body: `
        import { createBrowserBridge as real } from './${file}?real';
        export function createBrowserBridge() {
          const bridge = real();
          const search = bridge.stats.searchPlayer;
          bridge.stats.searchPlayer = (request, opts) => {
            const failure = window.searchFailure;
            if (failure.left > 0) {
              failure.left -= 1;
              return Promise.reject({ ...failure.error, retryAfterSec: null });
            }
            return search.call(bridge.stats, request, opts);
          };
          return bridge;
        }`,
    });
  });
}

const hashOf = (page: Page): string => new URL(page.url()).hash;
const field = (page: Page) => page.getByRole('combobox', { name: 'Search players' });
const platformSelect = (page: Page) => page.getByRole('combobox', { name: 'Platform to search' });
const results = (page: Page, platform: string) => page.getByRole('listbox', { name: `Players on ${platform}` });
const suggestions = (page: Page) => page.getByRole('listbox', { name: 'Search suggestions' });
/** The accessible names of a listbox's options; each starts with the player's name. */
const optionNames = (list: Locator): Promise<string[]> => list.getByRole('option').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
const playerName = (optionName: string): string => optionName.split(', ')[0] ?? '';
/** The results list once the answer for what is typed is in (not the previous answer kept on screen meanwhile). */
async function settledResults(page: Page, platform: string): Promise<Locator> {
  const list = results(page, platform);
  await expect(list.getByRole('option').first()).toBeVisible({ timeout: 10_000 });
  await expect(list).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
  return list;
}

test('typing part of a handle lists matching players for the platform, exact match first; switching platform searches again', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  await page.keyboard.press('Control+k');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('otter');

  const pc = await settledResults(page, 'PC');
  const pcNames = (await optionNames(pc)).map(playerName);
  expect(pcNames.length).toBeGreaterThan(0);
  expect(pcNames.length).toBeLessThanOrEqual(8);
  for (const name of pcNames) expect(name.toLowerCase()).toContain('otter');
  // The typed part is emphasised inside the name (weight, not colour).
  await expect(pc.getByRole('option').first().locator('mark')).toHaveText(/^otter$/i);
  // Each row shows level, rank and last played; unknown values are a dash, never 0.
  await expect(pc.getByRole('option').first()).toContainText(/Lv (\d[\d,]*|–)/);
  await expect(pc.getByRole('option').first().getByRole('img')).toHaveAccessibleName(/.+/);

  // Another platform is another set of accounts.
  await platformSelect(page).selectOption('xbl');
  await expect(field(page)).toHaveValue('otter');
  const xbox = await settledResults(page, 'Xbox');
  const xboxNames = (await optionNames(xbox)).map(playerName);
  for (const name of xboxNames) expect(name.toLowerCase()).toContain('otter');
  expect(xboxNames).not.toEqual(pcNames);
  // The search's platform is not the default platform setting.
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('sightline.settings') ?? '{}').defaultPlatform)).not.toBe('xbl');

  // The exact name of a player that was not first: now they come first, marked as the exact match.
  const target = xboxNames.at(-1) ?? '';
  await field(page).fill(target);
  await expect(xbox.getByRole('option').first()).toHaveAccessibleName(new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, exact match, `), {
    ignoreCase: true,
    timeout: 10_000,
  });
  await expect(xbox.getByRole('option').first()).toContainText('Exact');
  expect(errors).toEqual([]);
});

test('arrow keys move the active option and wrap, Enter opens the profile, and the player is then under Recent', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('quiet');
  const list = await settledResults(page, 'PC');
  const options = list.getByRole('option');
  const count = await options.count();
  expect(count).toBeGreaterThan(1);

  const active = async (): Promise<string | null> => field(page).getAttribute('aria-activedescendant');
  expect(await active()).toBeNull();
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  expect(await active()).toBe(await options.nth(0).getAttribute('id'));
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  // Up from the first wraps to the last, Down from the last back to the first.
  await expect(options.nth(count - 1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  const chosen = playerName((await options.nth(1).getAttribute('aria-label')) ?? '');

  await page.keyboard.press('Enter');
  await expect.poll(() => hashOf(page)).toMatch(/^#\/player\/pc\/[^/?]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chosen, { timeout: 15_000 });
  // Opening closes the list, empties the field and leaves it.
  await expect(field(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(field(page)).toHaveValue('');
  await expect(field(page)).not.toBeFocused();

  // With an empty field, the player is listed under Recent, and opens from there too.
  await page.keyboard.press('Control+k');
  const recent = suggestions(page).getByRole('group', { name: 'Recent' });
  await expect(recent.getByRole('option')).toHaveCount(1);
  await expect(recent.getByRole('option').first()).toHaveAccessibleName(new RegExp(`^${chosen}, PC, searched just now$`));
  const profileHash = hashOf(page);
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leaderboards' }).click();
  await expect.poll(() => hashOf(page)).toBe('#/leaderboards');
  await page.keyboard.press('Control+k');
  await suggestions(page).getByRole('group', { name: 'Recent' }).getByRole('option').first().click();
  await expect.poll(() => hashOf(page)).toBe(profileHash);
  expect(errors).toEqual([]);
});

test('Enter right after typing opens the first result once it arrives', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('otter');
  const first = (await settledResults(page, 'PC')).getByRole('option').first();
  const exact = playerName((await first.getAttribute('aria-label')) ?? '');

  await field(page).fill('');
  // No pause for the results: Enter waits for the answer to the full name, which lists the exact match first.
  await field(page).pressSequentially(exact, { delay: 0 });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(exact, { timeout: 15_000 });
  expect(hashOf(page)).toMatch(/^#\/player\/pc\//);
  expect(errors).toEqual([]);
});

test('a name nobody has shows the empty state with the other platforms one click away', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('zzqx nobody');
  await expect(page.getByText('No players named “zzqx nobody” on PC', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: 'No players named' })).toHaveText('No players named “zzqx nobody” on PC.');
  await expect(page.getByRole('button', { name: 'Search on PC' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Search on Xbox' }).click();
  await expect(platformSelect(page)).toHaveValue('xbl');
  await expect(field(page)).toBeFocused();
  await expect(page.getByText('No players named “zzqx nobody” on Xbox', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Search on PC' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search on PlayStation' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Escape closes the list and keeps focus, a second Escape clears the field; Ctrl+K works from inside a page', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, `/player/${LUHAL.platform}/${LUHAL.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LUHAL.name, { timeout: 15_000 });
  await page.keyboard.press('Control+k');
  await page.keyboard.type('quiet');
  await expect(results(page, 'PC').getByRole('option').first()).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('Escape');
  await expect(results(page, 'PC')).toBeHidden();
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(field(page)).toHaveValue('quiet');
  // Typing again reopens it.
  await page.keyboard.type('_');
  await expect(field(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(field(page)).toHaveValue('');
  await expect(field(page)).toBeFocused();

  // From a profile tab with focus, Ctrl+K takes focus back to the search; Alt+Left in the field still goes back.
  await page.getByRole('tab', { name: 'Seasons' }).click();
  await expect(page.getByRole('tab', { name: 'Seasons' })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe(`#/player/${LUHAL.platform}/${LUHAL.id}`);
  expect(errors).toEqual([]);
});

test('"Search this name on Xbox" from a profile opens the search filled in, on Xbox', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, `/player/${LUHAL.platform}/${LUHAL.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LUHAL.name, { timeout: 15_000 });
  await page.getByRole('group', { name: 'Platform' }).getByRole('button', { name: 'Xbox, no linked account' }).click();
  await page.getByRole('button', { name: `Search “${LUHAL.name}” on Xbox` }).click();

  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue(LUHAL.name);
  await expect(field(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(platformSelect(page)).toHaveValue('xbl');
  // An ordinary search on Xbox: whatever it finds there is not claimed to be the same person.
  const xbox = results(page, 'Xbox');
  await expect(xbox.getByRole('option').first().or(page.getByText(`No players named “${LUHAL.name}” on Xbox`, { exact: true }))).toBeVisible({ timeout: 10_000 });
  for (const name of (await optionNames(xbox)).map(playerName)) expect(name.toLowerCase()).toContain(LUHAL.name.toLowerCase());

  // A not-found page's "Search for the player" opens the empty search on that platform.
  await page.goto(`${appUrl}/#/player/psn/no-such-account`);
  await page.getByRole('button', { name: 'Search for the player' }).click({ timeout: 15_000 });
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('');
  await expect(platformSelect(page)).toHaveValue('psn');
  await expect(field(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Type a player’s in-game name.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pinned accounts, favourites and recent searches fill the empty box in that order, each player once', async ({ page, appUrl }) => {
  const pinned = { player: { platform: LUHAL.platform, id: LUHAL.id, name: LUHAL.name, avatarUrl: null }, pinnedAt: '2026-11-01T10:00:00.000Z' };
  await page.addInitScript((json) => {
    if (!window.localStorage.getItem('sightline.settings')) window.localStorage.setItem('sightline.settings', json);
  }, JSON.stringify({ accounts: { mock: { pinned: [pinned], active: { platform: LUHAL.platform, id: LUHAL.id } } } }));
  const errors = await open(page, appUrl);

  // Before anything is searched: just the pinned account.
  await page.keyboard.press('Control+k');
  await expect(suggestions(page).getByRole('group')).toHaveCount(1);
  await expect(suggestions(page).getByRole('group', { name: 'My accounts' }).getByRole('option')).toHaveAccessibleName(`${LUHAL.name}, PC`);

  // Open two players from the search and star the second.
  const openFirst = async (text: string): Promise<string> => {
    await page.keyboard.press('Control+k');
    await page.keyboard.type(text);
    const option = (await settledResults(page, 'PC')).getByRole('option').first();
    await expect(option).toHaveAccessibleName(new RegExp(text, 'i'));
    const name = playerName((await option.getAttribute('aria-label')) ?? '');
    await option.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
    return name;
  };
  const first = await openFirst('quiet');
  const second = await openFirst('otter');
  await page.getByRole('button', { name: `Add ${second} to favourites` }).click();
  // The pinned account opened from the search goes to Recent too, but is listed only under My accounts.
  await page.keyboard.press('Control+k');
  await suggestions(page).getByRole('group', { name: 'My accounts' }).getByRole('option').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LUHAL.name, { timeout: 15_000 });

  await page.keyboard.press('Control+k');
  const groups = suggestions(page).getByRole('group');
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toHaveAccessibleName('My accounts');
  await expect(groups.nth(1)).toHaveAccessibleName('Favourites');
  await expect(groups.nth(2)).toHaveAccessibleName('Recent');
  await expect(suggestions(page).getByRole('group', { name: 'Favourites' }).getByRole('option')).toHaveAccessibleName(`${second}, PC`);
  await expect(suggestions(page).getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveCount(1);
  await expect(suggestions(page).getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveAccessibleName(new RegExp(`^${first}, PC, `));
  // The arrow keys run through all three groups.
  await page.keyboard.press('ArrowUp');
  await expect(suggestions(page).getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('a failing search shows an error with Retry, and a source without search says so', async ({ page, appUrl }) => {
  await failSearches(page, { code: 'network', message: 'The stats source could not be reached.' }, 1);
  const errors = await open(page, appUrl);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('otter');
  await expect(page.getByText('The search failed', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('The stats source could not be reached.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(results(page, 'PC').getByRole('option').first()).toBeVisible({ timeout: 10_000 });
  await expect(field(page)).toBeFocused();

  await page.evaluate(() =>
    Object.assign(window, { searchFailure: { error: { code: 'unsupported', message: 'This source cannot search for players.' }, left: 1 } }),
  );
  await field(page).fill('quiet');
  await expect(page.getByText('Not available from this source', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the dropdown fits the smallest window', async ({ page, appUrl }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const errors = await open(page, appUrl);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('ka');
  const options = results(page, 'PC').getByRole('option');
  await expect(options).toHaveCount(8, { timeout: 10_000 });
  await expect(page.getByText('Showing the first 8 matches.')).toBeVisible();
  const box = await results(page, 'PC').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(700);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test('My Profile onboarding: the inline search pins the picked account', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/profile');
  const box = page.getByRole('combobox', { name: 'Find your account' });
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Type your in-game name, then pick your account from the list.')).toBeVisible();

  await page.getByRole('radiogroup', { name: 'Platform to search' }).getByRole('radio', { name: 'PlayStation' }).click();
  await box.click();
  await page.keyboard.type('otter');
  const list = await settledResults(page, 'PlayStation');
  const name = playerName((await list.getByRole('option').first().getAttribute('aria-label')) ?? '');
  await page.keyboard.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', (await list.getByRole('option').first().getAttribute('id')) ?? '');
  await page.keyboard.press('Enter');

  // Pinned as mine: My Profile now shows it, and the account switcher names it.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: `My accounts: ${name}` })).toBeVisible();
  expect(hashOf(page)).toBe('#/profile');
  // The title bar's search now lists it under My accounts (and, though remembered as a search, not again under Recent).
  await page.keyboard.press('Control+k');
  await expect(suggestions(page).getByRole('group', { name: 'My accounts' }).getByRole('option')).toHaveAccessibleName(`${name}, PlayStation`);
  await expect(suggestions(page).getByRole('group')).toHaveCount(1);
  expect(errors).toEqual([]);
});
