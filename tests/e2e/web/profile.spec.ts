import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SeasonDef } from '../../../src/shared/types/game-config';
import { expect, test } from './serve';

/**
 * Player profile and My Profile on the mock data. The accounts below come from the seeded mock world: they depend
 * only on MOCK_SEED and the game config, never on the clock, so they exist on every run. Their stats do move with
 * the clock, which serve.ts pins to TEST_NOW for every page.
 *   LuhalAlt (PC): a full ranked season; the source links one PlayStation account, nothing on Xbox.
 */
const PLAYER = { platform: 'pc', id: '17c92055-6505-482b-922b-f80b5a5c03a1', name: 'LuhalAlt' } as const;
const LINKED = { platform: 'psn', id: 'bdd96aff-fd72-4267-8ab6-69cd3addfe20' } as const;
const profileRoute = (p: { platform: string; id: string }, search = ''): string => `/player/${p.platform}/${p.id}${search}`;
const seasons = (JSON.parse(readFileSync('config/game/seasons.json', 'utf8')) as { seasons: SeasonDef[] }).seasons;

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

test('picking my account in the onboarding search pins it and moves focus to the profile heading', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/profile');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Profile');
  const box = page.getByRole('combobox', { name: 'Find your account' });
  await box.fill(PLAYER.name);
  const option = page.getByRole('option', { name: new RegExp(`^${PLAYER.name} `) }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await box.press('ArrowDown');
  await box.press('Enter');
  // The search box is gone and the route stays /profile: focus lands on the profile's h1, not on the page.
  await loaded(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText('Your account', { exact: true })).toBeVisible();
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

  // An unlinked platform is focusable, explains itself and offers an ordinary search for the same name. Its label is
  // plain muted text, never dimmed below it (an active control keeps 4.5:1): nothing on the way to it is translucent.
  const xbox = platforms.getByRole('button', { name: 'Xbox, no linked account' });
  const opacities = await xbox.evaluate((button) => {
    const out: string[] = [];
    for (let node: Element | null = button; node && node.getAttribute('role') !== 'group'; node = node.parentElement) out.push(getComputedStyle(node).opacity);
    return out;
  });
  expect(opacities.every((opacity) => opacity === '1')).toBe(true);
  await xbox.hover();
  expect(await xbox.evaluate((button) => getComputedStyle(button).opacity)).toBe('1');
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

test('one current season everywhere: after a new season starts, every card, filter and badge names it', async ({ page, appUrl }) => {
  // Two days into Y11S4. The config's currentSeasonId may still name the season before: the clock decides.
  const at = '2026-12-03T12:00:00.000Z';
  const season = seasons.find((s) => s.startsAt <= at && (s.endsAt === null || at < s.endsAt));
  expect(season?.id).toBe('Y11S4');
  const { id, name, startsAt } = season as SeasonDef;
  await page.clock.setSystemTime(new Date(at));
  const errors = await open(page, appUrl, profileRoute(PLAYER, '?hperiod=season'));
  await loaded(page);

  // Overview: the current season card, the ranked sessions chart and the peak ranks' "Current season" row.
  const current = page.getByRole('region', { name: 'Current season' });
  const subtitle = current.getByText(new RegExp(`^${name} · \\d+ match(es)? · `));
  await expect(subtitle).toBeVisible({ timeout: 15_000 });
  const seasonMatches = Number(/· (\d+) match/.exec(await subtitle.innerText())?.[1]);
  await expect(page.getByRole('region', { name: 'Ranked sessions' })).toContainText(`RP after every Ranked match · ${name} · `, { timeout: 15_000 });
  const peaks = page.getByRole('region', { name: 'Peak ranks' });
  await expect(peaks.getByText(`${id} · Current season`)).toBeVisible();
  await expect(peaks.getByText(/Current season/)).toHaveCount(1);

  // Match history, "Season": the same matches as the card, all on or after the season's start.
  await expect(page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: 'Season' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/^Showing \d+ of \d+ match(es)?$/)).toHaveText(new RegExp(`of ${seasonMatches} match(es)?$`), { timeout: 15_000 });
  const dates = await page.getByRole('table', { name: 'Match history' }).locator('tbody time').evaluateAll((times) => times.map((t) => t.getAttribute('datetime') ?? ''));
  expect(dates.length).toBeGreaterThan(0);
  expect(dates.every((date) => date >= startsAt)).toBe(true);

  // Seasons tab: the "Current" badge sits on that season's row.
  await tabs(page).getByRole('tab', { name: 'Seasons' }).click();
  const currentRow = page.getByRole('table', { name: 'Seasons' }).locator('tbody tr').filter({ hasText: 'Current' });
  await expect(currentRow).toHaveCount(1, { timeout: 15_000 });
  await expect(currentRow).toContainText(name);

  // Operators: the season filter starts on it, and keeps the URL clean.
  await tabs(page).getByRole('tab', { name: 'Operators' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Operators' })).toBeVisible();
  const select = page.getByRole('combobox', { name: 'Season', exact: true });
  await expect(select).toHaveValue(id);
  await expect(select.locator('option:checked')).toHaveText(`${name} (${id})`);
  expect(new URL(page.url()).hash).not.toContain('oseason');
  expect(errors).toEqual([]);
});

test('a season starting while the profile is open: within one tick the profile moves to it, no refresh', async ({ page, appUrl }) => {
  // Two minutes before Y11S4 starts. The mock world is made then, so the account has no Y11S4 match yet.
  const at = '2026-11-30T23:58:00.000Z';
  const old = seasons.find((s) => s.startsAt <= at && (s.endsAt === null || at < s.endsAt)) as SeasonDef;
  const next = seasons.find((s) => s.startsAt === old.endsAt) as SeasonDef;
  expect([old.id, next?.id]).toEqual(['Y11S3', 'Y11S4']);
  await page.clock.setSystemTime(new Date(at));
  const errors = await open(page, appUrl, profileRoute(PLAYER, '?hperiod=season'));
  await loaded(page);
  const current = page.getByRole('region', { name: 'Current season' });
  await expect(current.getByText(new RegExp(`^${old.name} · \\d+ matches · `))).toBeVisible({ timeout: 15_000 });
  const peaks = page.getByRole('region', { name: 'Peak ranks' });
  await expect(peaks.getByText(`${old.id} · Current season`)).toBeVisible();
  const heading = page.getByRole('heading', { level: 1 });
  await heading.focus();

  // Three minutes on, as when the app stays open (the clock jumps; the 30 s timers fire once).
  await page.clock.fastForward('03:00');
  await expect(current.getByText(new RegExp(`^${next.name} · 0 matches · `))).toBeVisible({ timeout: 15_000 });
  // The header kept its data while the profile was asked again, so it never dropped to its skeleton and the focus.
  await expect(heading).toHaveText(PLAYER.name);
  await expect(heading).toBeFocused();
  await expect(current).toContainText(`Nothing played in ${next.name} so far`);
  await expect(page.getByRole('region', { name: 'Ranked sessions' })).toContainText(`RP after every Ranked match · ${next.name} · 0 matches`);
  await expect(page.getByRole('heading', { name: 'No matches this season', exact: true })).toBeVisible(); // history, Season
  // Nothing calls the old season current any more: Peak ranks and the Seasons tab list the seasons played, and
  // Y11S3 is now a finished one there; the Y11S4 row comes with the account's first match of it.
  await expect(peaks.getByText(/Current season/)).toHaveCount(0);
  await tabs(page).getByRole('tab', { name: 'Seasons' }).click();
  const rows = page.getByRole('table', { name: 'Seasons' }).locator('tbody tr');
  await expect(rows.first()).toContainText(old.name, { timeout: 15_000 });
  await expect(rows.filter({ hasText: 'Current' })).toHaveCount(0);
  await tabs(page).getByRole('tab', { name: 'Operators' }).click();
  await expect(page.getByRole('combobox', { name: 'Season', exact: true })).toHaveValue(next.id);
  expect(errors).toEqual([]);
});
