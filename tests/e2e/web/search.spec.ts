import type { Locator, Page } from '@playwright/test';
import { createRequire } from 'node:module';
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

/** The built chunk that exports the browser bridge, whatever the bundler named it. */
const EXPORTS_BRIDGE = /export\s*\{[^}]*\bcreateBrowserBridge\s*\}/;

/**
 * Makes the in-page stats source fail the next `times` player searches with `error`, by serving a wrapper in place of
 * the browser bridge's module: the browser build has no other seam, and nothing here touches the app's own code.
 */
async function failSearches(page: Page, error: { code: string; message: string }, times: number): Promise<void> {
  await page.addInitScript(([e, n]) => Object.assign(window, { searchFailure: { error: e, left: n } }), [error, times] as const);
  // Every script of the build passes through unchanged except the one that exports createBrowserBridge. The wrapper's
  // own import of it (with "?real") does not end in ".js", so it is not routed.
  await page.route(/\/assets\/[^/?]+\.js$/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    if (!EXPORTS_BRIDGE.test(source)) {
      await route.fulfill({ response, body: source });
      return;
    }
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
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * An element's accessible name as the browser computes it, read off its ARIA snapshot (options have no aria-label:
 * they are named from their cells). The snapshot's first line is `- role "name"`, YAML-quoted as a whole when needed.
 */
async function accessibleName(locator: Locator): Promise<string> {
  let line = ((await locator.ariaSnapshot()).split('\n')[0] ?? '').replace(/^- /, '');
  if (line.startsWith("'")) line = line.slice(1, line.lastIndexOf("'")).replace(/''/g, "'");
  const quoted = /^[\w-]+ ("(?:[^"\\]|\\.)*")/.exec(line)?.[1];
  return quoted ? (JSON.parse(quoted) as string) : '';
}
/** The accessible names of a listbox's options, in order. */
const optionNames = async (list: Locator): Promise<string[]> => Promise.all((await list.getByRole('option').all()).map(accessibleName));
/** The player's name at the start of a result option's name ("Otter_919 Exact match Lv 236 S3 Silver III 7 h ago"). */
const playerName = (optionName: string): string => /^(.+?) (?:Exact match )?Lv /.exec(optionName)?.[1] ?? '';
/**
 * Label in name, checked without axe (the axe tests below need axe-core): no option has an aria-label or
 * aria-labelledby, which axe's label-content-name-mismatch holds against everything the row draws, the avatar's
 * initials included, so each is named from its cells; and that name holds every word the row shows, in the row's
 * order. The words drawn inside an image (the badge's "S3") count, since its name stands for them; other aria-hidden
 * text (the initials) does not, and a mark with no letter or digit ("–" for unranked) is named in words.
 */
async function expectNamedFromContent(list: Locator): Promise<void> {
  const options = await list.getByRole('option').all();
  expect(options.length).toBeGreaterThan(0);
  for (const option of options) {
    const { labelled, words } = await option.evaluate((element) => {
      const shown: string[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || parent.closest('.sr-only')) continue;
        if (parent.closest('[aria-hidden="true"]') && !parent.closest('[role="img"][aria-label]')) continue;
        shown.push(...(node.textContent ?? '').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)));
      }
      return { labelled: element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'), words: shown };
    });
    const name = await accessibleName(option);
    expect(labelled, `"${name}" is named from its cells`).toBe(false);
    let from = 0;
    for (const word of words) {
      const at = name.toLowerCase().indexOf(word.toLowerCase(), from);
      expect(at, `"${name}" holds the shown "${word}" in the row's order`).toBeGreaterThanOrEqual(0);
      from = at + word.length;
    }
  }
}
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
  // The option is named from its cells: the row's visible words in order, the player's name first ("Otter_919 Lv 236
  // S3 Silver III 7 h ago"). The badge is named by the short name it shows and then the full one; a dash or a
  // question mark is named in words.
  const row = pc.getByRole('option').first();
  const name = (await row.locator('mark').locator('..').innerText()).trim();
  const level = (await row.locator('[title="Level"]').innerText()).trim();
  const badge = (await row.getByRole('img').innerText()).trim();
  const rankName = (await row.getByRole('img').getAttribute('title')) ?? '';
  const played = (await row.locator('[title="Last played"]').innerText()).trim();
  expect(rankName).not.toBe('');
  const rank = /^[–?]$/.test(badge) ? rankName : `${badge} ${rankName}`;
  await expect(row.getByRole('img')).toHaveAccessibleName(rank);
  await expect(row).toHaveAccessibleName(`${name} ${level} ${rank} ${played}`);
  await expectNamedFromContent(pc);

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
  await expect(xbox.getByRole('option').first()).toHaveAccessibleName(new RegExp(`^${escape(target)} Exact match Lv `), { timeout: 10_000 });
  await expect(xbox.getByRole('option').first()).toContainText('Exact');
  await expectNamedFromContent(xbox);
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
  // The active option's bar is in accent-text, which keeps 3:1 on the hover tint it sits on in every theme.
  const accentText = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent-text)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(await options.nth(0).evaluate((element) => getComputedStyle(element).boxShadow)).toContain(accentText);
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
  const chosen = playerName(await accessibleName(options.nth(1)));

  await page.keyboard.press('Enter');
  await expect.poll(() => hashOf(page)).toMatch(/^#\/player\/pc\/[^/?]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chosen, { timeout: 15_000 });
  // Opening closes the list, empties the field and leaves it.
  await expect(field(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(field(page)).toHaveValue('');
  await expect(field(page)).not.toBeFocused();
  // Focus moves to the new page's heading, not to the document.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

  // With an empty field, the player is listed under Recent, and opens from there too.
  await page.keyboard.press('Control+k');
  const recent = suggestions(page).getByRole('group', { name: 'Recent' });
  await expect(recent.getByRole('option')).toHaveCount(1);
  await expect(recent.getByRole('option').first()).toHaveAccessibleName(`${chosen} PC just now`);
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
  const exact = playerName(await accessibleName(first));

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
  await expect(suggestions(page).getByRole('group', { name: 'My accounts' }).getByRole('option')).toHaveAccessibleName(`${LUHAL.name} PC`);

  // Open two players from the search and star the second.
  const openFirst = async (text: string): Promise<string> => {
    await page.keyboard.press('Control+k');
    await page.keyboard.type(text);
    const option = (await settledResults(page, 'PC')).getByRole('option').first();
    await expect(option).toHaveAccessibleName(new RegExp(text, 'i'));
    const name = playerName(await accessibleName(option));
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
  await expect(suggestions(page).getByRole('group', { name: 'Favourites' }).getByRole('option')).toHaveAccessibleName(`${second} PC`);
  await expect(suggestions(page).getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveCount(1);
  await expect(suggestions(page).getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveAccessibleName(new RegExp(`^${escape(first)} PC (just now|\\d+ min ago)$`));
  await expectNamedFromContent(suggestions(page));
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
  await expectNamedFromContent(list);
  const name = playerName(await accessibleName(list.getByRole('option').first()));
  await page.keyboard.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', (await list.getByRole('option').first().getAttribute('id')) ?? '');
  await page.keyboard.press('Enter');

  // Pinned as mine: My Profile now shows it, and the account switcher names it.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: `My accounts: ${name}` })).toBeVisible();
  expect(hashOf(page)).toBe('#/profile');
  // The title bar's search now lists it under My accounts (and, though remembered as a search, not again under Recent).
  await page.keyboard.press('Control+k');
  await expect(suggestions(page).getByRole('group', { name: 'My accounts' }).getByRole('option')).toHaveAccessibleName(`${name} PlayStation`);
  await expect(suggestions(page).getByRole('group')).toHaveCount(1);
  expect(errors).toEqual([]);
});

/**
 * axe-core's browser script, for the checks below: SIGHTLINE_AXE (a path to axe.min.js), else the axe-core package
 * when it is installed. The app does not depend on it yet, so without either those checks are skipped, saying why
 * (expectNamedFromContent still checks the options' names on every run).
 */
function axeScript(): string | null {
  if (process.env.SIGHTLINE_AXE) return process.env.SIGHTLINE_AXE;
  try {
    return createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  } catch {
    return null;
  }
}

/** axe's violations (every rule it runs by default) on an open search list and its field, as "rule: targets". */
async function axeViolations(page: Page, list: Locator, input: Locator): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: axeScript() ?? '' });
  const include = [await list.elementHandle(), await input.elementHandle()];
  return page.evaluate(async (nodes) => {
    type Axe = { run(context: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> };
    const { violations } = await (window as unknown as { axe: Axe }).axe.run({ include: nodes });
    return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }, include);
}

test.describe('axe', () => {
  test.skip(axeScript() === null, 'axe-core is not installed: set SIGHTLINE_AXE to the path of its axe.min.js');
  // axe goes in as an inline script, which the app's CSP (script-src 'self') would block.
  test.use({ bypassCSP: true });

  test('the open result lists, with an active option and an exact match, pass axe in dark, light and high-contrast themes', async ({ page, appUrl }) => {
    test.slow();
    const errors = await open(page, appUrl);
    for (const theme of ['graphite', 'daylight', 'high-contrast', 'ember', 'desert-dune', 'winter-holiday']) {
      // The stored theme applies on the next load.
      await page.evaluate((id) => window.localStorage.setItem('sightline.settings', JSON.stringify({ theme: { activeThemeId: id } })), theme);
      await page.goto(`${appUrl}/#/`);
      await page.reload();
      await page.waitForSelector('#root > *');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      // The title bar's list, with the first option active, then with an exact match first.
      await page.keyboard.press('Control+k');
      await page.keyboard.type('otter');
      const list = await settledResults(page, 'PC');
      await page.keyboard.press('ArrowDown');
      await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
      expect(await axeViolations(page, list, field(page)), `${theme}, title bar`).toEqual([]);
      const exact = playerName(await accessibleName(list.getByRole('option').first()));
      await field(page).fill(exact);
      await expect(list.getByRole('option').first()).toHaveAccessibleName(new RegExp(`^${escape(exact)} Exact match `), { timeout: 10_000 });
      expect(await axeViolations(page, list, field(page)), `${theme}, exact match`).toEqual([]);
      await page.keyboard.press('Escape');

      // My Profile's onboarding search (nothing is pinned).
      await page.goto(`${appUrl}/#/profile`);
      const box = page.getByRole('combobox', { name: 'Find your account' });
      await box.click();
      await page.keyboard.type('otter');
      const inline = await settledResults(page, 'PC');
      await page.keyboard.press('ArrowDown');
      await expect(inline.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
      expect(await axeViolations(page, inline, box), `${theme}, onboarding`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('the suggestions list (pinned, favourite, recent) passes axe', async ({ page, appUrl }) => {
    const pinned = { player: { platform: LUHAL.platform, id: LUHAL.id, name: LUHAL.name, avatarUrl: null }, pinnedAt: '2026-11-01T10:00:00.000Z' };
    await page.addInitScript((json) => {
      if (!window.localStorage.getItem('sightline.settings')) window.localStorage.setItem('sightline.settings', json);
    }, JSON.stringify({ accounts: { mock: { pinned: [pinned], active: { platform: LUHAL.platform, id: LUHAL.id } } } }));
    const errors = await open(page, appUrl);
    for (const [text, star] of [['quiet', false], ['otter', true]] as const) {
      await page.keyboard.press('Control+k');
      await page.keyboard.type(text);
      const option = (await settledResults(page, 'PC')).getByRole('option').first();
      const name = playerName(await accessibleName(option));
      await option.click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
      if (star) await page.getByRole('button', { name: `Add ${name} to favourites` }).click();
    }
    await page.keyboard.press('Control+k');
    await expect(suggestions(page).getByRole('group')).toHaveCount(3);
    await page.keyboard.press('ArrowUp');
    await expect(suggestions(page).getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveAttribute('aria-selected', 'true');
    expect(await axeViolations(page, suggestions(page), field(page))).toEqual([]);
    expect(errors).toEqual([]);
  });
});
