import type { Page } from '@playwright/test';
import { expect, test } from './serve';

/**
 * Scroll position and focus across screen changes (shell/usePageRestore.ts), on the long profile of a fixed account
 * from the seeded mock world, at the smallest window. <main> is the page's only scroll container.
 */
const PLAYER = { platform: 'pc', id: '17c92055-6505-482b-922b-f80b5a5c03a1', name: 'LuhalAlt' } as const;
const PROFILE = `/player/${PLAYER.platform}/${PLAYER.id}`;

/** Opens the profile at 1100x700 and collects every console error and uncaught exception. */
async function openProfile(page: Page, appUrl: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto(`${appUrl}/#${PROFILE}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PLAYER.name, { timeout: 15_000 });
  await expect(views(page).first()).toBeVisible({ timeout: 15_000 });
  return errors;
}

const hashOf = (page: Page): string => new URL(page.url()).hash;
const views = (page: Page) => page.locator('main a[href*="#/match/"]');
const scrollTop = (page: Page): Promise<number> => page.locator('main').evaluate((main) => main.scrollTop);

test('a click on a blank part of the page leaves the next Tab after the click, where the page is', async ({ page, appUrl }) => {
  const errors = await openProfile(page, appUrl);
  const status = page.getByText(/^Showing 20 of \d+ matches$/);
  await status.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const top = await scrollTop(page);
  expect(top).toBeGreaterThan(300);

  // Blank space right of the "Showing" line: no control there.
  const box = await status.boundingBox();
  const point = { x: (box?.x ?? 0) + (box?.width ?? 0) + 60, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a, button, input, [tabindex]')?.outerHTML ?? null, point);
  expect(hit).toBeNull();
  await page.mouse.click(point.x, point.y);
  // <main> is not focusable, so the click does not move the place the next Tab starts from to the top of the page.
  await expect(page.locator('main')).not.toBeFocused();
  expect(await page.locator('main').getAttribute('tabindex')).toBeNull();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Load \d+ more$/ })).toBeFocused();
  expect(await scrollTop(page)).toBe(top);
  expect(errors).toEqual([]);
});

for (const filter of ['a playlist chip', 'the period'] as const) {
  test(`Back returns to the offset the profile was left at after ${filter} changed, with no scroll after it`, async ({ page, appUrl }) => {
    const errors = await openProfile(page, appUrl);
    const chips = page.getByRole('group', { name: 'Playlists' });
    // The filters near the top of the window, the match list below them.
    await chips.evaluate((group) => {
      const main = group.closest('main');
      main?.scrollTo(0, group.getBoundingClientRect().top + main.scrollTop - 200);
    });
    const top = await scrollTop(page);
    expect(top).toBeGreaterThan(300);

    // A filter change is a new history entry with a new query string, and keeps the position.
    if (filter === 'a playlist chip') {
      // The first chip is All, on by default.
      const chip = chips.getByRole('button').nth(1);
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
      await chip.focus();
      await page.keyboard.press('Enter');
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => hashOf(page)).toMatch(/\?hp=/);
    } else {
      await page.getByRole('radio', { name: '30 days' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('radio', { name: '90 days' })).toBeChecked();
      await expect.poll(() => hashOf(page)).toMatch(/\?hperiod=90$/);
    }
    // The filtered list in place of the previous one (shown dimmed and busy while it loads).
    await expect(page.getByRole('table', { name: 'Match history' })).not.toHaveAttribute('aria-busy');
    const filtered = hashOf(page);
    expect(await scrollTop(page)).toBe(top);

    // A new screen opens at its top.
    await views(page).first().click();
    await expect.poll(() => hashOf(page)).toMatch(/^#\/match\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await scrollTop(page)).toBe(0);

    await page.goBack();
    await expect.poll(() => hashOf(page)).toBe(filtered);
    await expect.poll(() => scrollTop(page)).toBe(top);
    expect(errors).toEqual([]);
  });
}

test('Back puts focus back on the link the profile was left from, so the next Tab goes on from there', async ({ page, appUrl }) => {
  const errors = await openProfile(page, appUrl);
  const heading = page.getByRole('heading', { level: 1 });
  const link = views(page).nth(15);
  await link.focus();
  const left = await scrollTop(page);
  expect(left).toBeGreaterThan(300);

  // A new screen: focus on its heading (the link went with the profile).
  await page.keyboard.press('Enter');
  await expect.poll(() => hashOf(page)).toMatch(/^#\/match\//);
  await expect(heading).toBeFocused();

  // Back: the profile at the offset it was left at, focus on the same link, though the page was rendered anew.
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe(`#${PROFILE}`);
  await expect(link).toBeFocused();
  await expect.poll(() => scrollTop(page)).toBe(left);
  await page.keyboard.press('Tab');
  await expect(views(page).nth(16)).toBeFocused();
  expect(await scrollTop(page)).toBeGreaterThanOrEqual(left);

  // Forward: the match had its heading focused when it was left, and gets it back.
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => hashOf(page)).toMatch(/^#\/match\//);
  await expect(heading).toBeFocused();
  expect(errors).toEqual([]);
});

test('Back finds the link again by its target when its name moved on while the profile was away', async ({ page, appUrl }) => {
  const errors = await openProfile(page, appUrl);
  const heading = page.getByRole('heading', { level: 1 });
  const first = views(page).first();
  await first.focus();
  const name = await first.getAttribute('aria-label');
  const href = await first.getAttribute('href');
  // The newest match of the account, so its name ends in a time that an hour moves on.
  expect(name).toMatch(/, \d+ (min|h) ago$/);

  await page.keyboard.press('Enter');
  await expect(heading).toHaveText(/ on /, { timeout: 15_000 });
  await page.clock.fastForward('01:00:00');

  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe(`#${PROFILE}`);
  const link = page.locator(`main a[href="${href}"]`);
  await expect(link).toBeFocused();
  await expect(link).not.toHaveAttribute('aria-label', name ?? '');
  await page.keyboard.press('Tab');
  await expect(views(page).nth(1)).toBeFocused();
  // Not thrown back to the top of the page. (The hour also dropped the profile's data from the query cache, so the
  // page is shorter while it loads again, and the offset can come back a little short of the one it was left at.)
  expect(await scrollTop(page)).toBeGreaterThan(300);
  expect(errors).toEqual([]);
});

test('Back gives focus to the heading when the control the profile was left from is not there again', async ({ page, appUrl }) => {
  const errors = await openProfile(page, appUrl);
  const heading = page.getByRole('heading', { level: 1 });
  const link = views(page).nth(15);
  await link.focus();
  const left = await scrollTop(page);
  // Stands in for a link that is not on the page shown again (a link is found again by its target and role): the
  // link rendered anew has no role attribute.
  await link.evaluate((element) => element.setAttribute('role', 'link'));

  await page.keyboard.press('Enter');
  await expect(heading).toHaveText(/ on /, { timeout: 15_000 });
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe(`#${PROFILE}`);
  await expect(heading).toHaveText(PLAYER.name);
  await expect(heading).toBeFocused();
  await expect(views(page).nth(15)).not.toBeFocused();
  await expect.poll(() => scrollTop(page)).toBe(left);
  expect(errors).toEqual([]);
});

test('Back from a match that is still loading also puts focus back on the link', async ({ page, appUrl }) => {
  const errors = await openProfile(page, appUrl);
  const heading = page.getByRole('heading', { level: 1 });
  const link = views(page).nth(15);
  await link.focus();
  const left = await scrollTop(page);

  // The clock stands still, so the match's data (behind the mock's latency) does not arrive. A second ahead, as the
  // clock must not be asked to pause in its past.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await page.keyboard.press('Enter');
  await expect(heading).toHaveText('Match details');
  await expect(heading).toBeFocused();

  // The loading heading hands its focus on to the profile's h1 as it goes; the link still gets it back.
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe(`#${PROFILE}`);
  await expect(link).toBeFocused();
  await expect.poll(() => scrollTop(page)).toBe(left);
  await page.clock.resume();
  expect(errors).toEqual([]);
});

test('Back after a title-bar search pick puts focus back on the link that had it before the search', async ({ page, appUrl }) => {
  const errors = await openProfile(page, appUrl);
  const heading = page.getByRole('heading', { level: 1 });
  const link = views(page).nth(15);
  await link.focus();
  const left = await scrollTop(page);
  expect(left).toBeGreaterThan(300);

  // Ctrl+K takes focus out of the page to the title bar; a pick opens another player.
  await page.keyboard.press('Control+k');
  const field = page.getByRole('combobox', { name: 'Search players' });
  await expect(field).toBeFocused();
  await field.fill('Otter');
  const option = page.getByRole('listbox').getByRole('option', { name: /^Otter/ }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await field.press('ArrowDown');
  await field.press('Enter');
  await expect.poll(() => hashOf(page)).toMatch(/^#\/player\//);
  await expect.poll(() => hashOf(page)).not.toBe(`#${PROFILE}`);
  await expect(heading).not.toHaveText(PLAYER.name, { timeout: 15_000 });

  // Back: the profile at its offset, and focus on the link, not on the off-screen heading, so Tab goes on from there.
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe(`#${PROFILE}`);
  await expect(link).toBeFocused();
  await expect.poll(() => scrollTop(page)).toBe(left);
  await page.keyboard.press('Tab');
  await expect(views(page).nth(16)).toBeFocused();
  expect(errors).toEqual([]);
});

test('a click while Back still waits for the page keeps focus where the user put it', async ({ page, appUrl }) => {
  const errors = await openProfile(page, appUrl);
  const heading = page.getByRole('heading', { level: 1 });
  const link = views(page).nth(15);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => hashOf(page)).toMatch(/^#\/match\//);
  await expect(heading).toBeFocused();

  // Away for longer than the query cache keeps the profile, so Back renders it from the source, behind the latency.
  await page.clock.fastForward('06:00');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => hashOf(page)).toBe(`#${PROFILE}`);
  // The page is still loading: the link is not there yet, so Back waits for it.
  await expect(views(page)).toHaveCount(0);
  // The user clicks blank space in the page before the data arrives: the wait gives way.
  const area = await page.locator('main').boundingBox();
  const point = { x: (area?.x ?? 0) + (area?.width ?? 0) - 24, y: (area?.y ?? 0) + (area?.height ?? 0) - 24 };
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a, button, input, [tabindex]')?.outerHTML ?? null, point);
  expect(hit).toBeNull();
  await page.mouse.click(point.x, point.y);
  const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? null);
  await page.clock.resume();
  await expect(heading).toHaveText(PLAYER.name, { timeout: 15_000 });
  await expect(views(page).nth(15)).toBeVisible();
  await expect(link).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? null)).toBe(focused);
  expect(errors).toEqual([]);
});
