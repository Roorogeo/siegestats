import type { Locator, Page } from '@playwright/test';
import { expect, test } from './serve';

/**
 * The profile's match history and its Seasons, Encounters, Operators, Maps and Linked accounts tabs, on the mock
 * data. The mock's accounts depend only on its fixed seed and the game config, never on the clock; their stats move with the clock, which serve.ts pins to TEST_NOW (data layer
 * decisions), so these two accounts are the same on every run; their matches move with the date, so nothing below
 * depends on a particular count.
 */
const NO_LINKS = { platform: 'psn', id: '23d397de-821a-4d1c-9c72-39b1826d2a87' } as const; // TinyFerret: ~90 matches, no linked accounts
const LINKED = { platform: 'xbl', id: 'd9fadf8d-d614-4d1b-a57f-b0facec05e39' } as const; // GaryorJr: linked to a PC account

const profileRoute = (player: { platform: string; id: string }, search = ''): string => `/player/${player.platform}/${player.id}${search}`;

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

/** The search params of the hash route ("#/player/psn/x?tab=maps&mseason=all"). */
const hashParams = (page: Page): URLSearchParams => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');

const historyRows = (page: Page): Locator => page.getByRole('table', { name: 'Match history' }).locator('tbody tr');

/** The text of one column of a table body, in row order. */
const columnTexts = (rows: Locator, column: number): Promise<string[]> =>
  rows.evaluateAll((trs, n) => trs.map((tr) => (tr.querySelectorAll('td')[n - 1]?.textContent ?? '').trim()), column);

/** The visible part of a summary value (the screen-reader text after it is left out). */
const summaryValue = (page: Page, label: string): Locator =>
  page.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');

const fixed = (digits: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A column of figures as numbers; the en dash of an unknown value is null. */
const numbers = (texts: readonly string[]): (number | null)[] =>
  texts.map((text) => {
    const figure = /^[+-]?[\d,.]+/.exec(text)?.[0];
    return figure === undefined ? null : Number(figure.replace(/[,+]/g, ''));
  });

test('match history: chips and period filter the rows, live in the URL, and back / forward restore them', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(NO_LINKS));
  const rows = historyRows(page);
  await expect(rows.first()).toContainText('View match', { timeout: 15_000 });

  const period = page.getByRole('radiogroup', { name: 'Period' });
  await expect(period.getByRole('radio', { name: '30 days' })).toHaveAttribute('aria-checked', 'true');
  await period.getByRole('radio', { name: '90 days' }).click();
  await expect.poll(() => hashParams(page).get('hperiod')).toBe('90');
  await expect(page.getByText(/^Showing 20 of \d+ matches$/)).toBeVisible({ timeout: 15_000 });

  const chips = page.getByRole('group', { name: 'Playlists' });
  const ranked = chips.getByRole('button', { name: /^Ranked/ });
  await ranked.click();
  await expect.poll(() => hashParams(page).get('hp')).toBe('ranked');
  await expect.poll(async () => [...new Set(await columnTexts(rows, 1))], { timeout: 15_000 }).toEqual(['Ranked']);

  // Back: All again, so other modes come back; back again: the default period.
  await page.goBack();
  await expect.poll(() => hashParams(page).get('hp')).toBeNull();
  await expect(chips.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => new Set(await columnTexts(rows, 1)).size, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.goBack();
  await expect.poll(() => hashParams(page).get('hperiod')).toBeNull();
  await expect(period.getByRole('radio', { name: '30 days' })).toHaveAttribute('aria-checked', 'true');

  await page.goForward();
  await page.goForward();
  await expect(ranked).toHaveAttribute('aria-pressed', 'true');
  await expect(period.getByRole('radio', { name: '90 days' })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('Load more appends pages, and the summary row agrees with every loaded row', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(NO_LINKS, '?hperiod=90'));
  const rows = historyRows(page);
  await expect(rows.first()).toContainText('View match', { timeout: 15_000 });
  const status = page.getByText(/^Showing \d+ of \d+ match(es)?$/);
  await expect(status).toHaveText(/^Showing 20 of \d+ matches$/);
  const total = Number(/of (\d+)/.exec(await status.innerText())?.[1]);
  expect(total).toBeGreaterThan(20);

  const loadMore = page.getByRole('button', { name: /^Load \d+ more$/ });
  for (let shown = 20; shown < total; ) {
    await loadMore.click();
    shown = Math.min(shown + 20, total);
    await expect(rows).toHaveCount(shown, { timeout: 15_000 });
  }
  await expect(loadMore).toHaveCount(0);
  await expect(status).toHaveText(`Showing ${total} of ${total} matches`);

  const modes = await columnTexts(rows, 1);
  const results = await columnTexts(rows, 4);
  const changes = await columnTexts(rows, 6);
  const kda = (await columnTexts(rows, 8)).map((t) => t.split('/').map(Number));
  const ids = await page.getByRole('table', { name: 'Match history' }).getByRole('link', { name: /^View match/ }).evaluateAll((links) =>
    links.map((a) => a.getAttribute('href')),
  );
  expect(new Set(ids).size).toBe(ids.length);

  const wins = results.filter((r) => r.startsWith('Win')).length;
  const losses = results.filter((r) => r.startsWith('Loss')).length;
  const kills = kda.reduce((sum, [k = 0]) => sum + k, 0);
  const deaths = kda.reduce((sum, [, d = 0]) => sum + d, 0);
  const first = results[0]?.startsWith('Win') ? 'Win' : 'Loss';
  let streak = 0;
  while (results[streak]?.startsWith(first)) streak += 1;
  // The summary's points change is the Ranked ladder's when the period has any ranked match.
  const rankedChanges = numbers(changes.filter((_, i) => modes[i] === 'Ranked')).filter((n): n is number => n !== null);
  const rp = rankedChanges.reduce((sum, n) => sum + n, 0);

  await expect(summaryValue(page, 'Matches')).toHaveText(String(total));
  await expect(summaryValue(page, 'Streak').locator('[aria-hidden="true"]')).toHaveText(`${first === 'Win' ? 'W' : 'L'}${streak}`);
  await expect(summaryValue(page, 'Win rate')).toHaveText(`${fixed(1).format((wins / (wins + losses)) * 100)}%`);
  await expect(summaryValue(page, 'K/D')).toHaveText(fixed(2).format(kills / Math.max(deaths, 1)));
  await expect(summaryValue(page, 'Kills per match')).toHaveText(fixed(1).format(kills / total));
  if (rankedChanges.length > 0) {
    const text = rp === 0 ? '0' : `${rp > 0 ? '+' : '-'}${fixed(0).format(Math.abs(rp))}`;
    await expect(summaryValue(page, 'RP change').locator('[aria-hidden="true"]').first()).toHaveText(text);
  }
  expect(errors).toEqual([]);
});

test('View match opens the match from this player’s point of view', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(NO_LINKS));
  const link = page.getByRole('table', { name: 'Match history' }).getByRole('link', { name: /^View match: (Win|Loss|Draw) \d+-\d+/ }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(new RegExp(`^#/match/[^?/]+\\?pov=${NO_LINKS.platform}:${NO_LINKS.id}$`));
  expect(errors).toEqual([]);
});

test('encounters: most matches first, a name filter, and each player links to their profile', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(NO_LINKS, '?tab=encounters'));
  const table = page.getByRole('table', { name: 'Encounters' });
  const rows = table.locator('tbody tr');
  await expect(rows.first().getByRole('link').first()).toBeVisible({ timeout: 15_000 });
  await expect(table.getByRole('columnheader', { name: 'Matches' })).toHaveAttribute('aria-sort', 'descending');
  const counts = numbers(await columnTexts(rows, 2));
  expect(counts.every((n) => n !== null && n >= 2)).toBe(true);
  expect(counts).toEqual([...counts].sort((a, b) => (b ?? 0) - (a ?? 0)));

  const name = (await rows.nth(1).getByRole('link').first().innerText()).trim();
  await page.getByRole('searchbox', { name: 'Filter players by name' }).fill(name);
  await expect(rows.first()).toContainText(name);
  expect((await columnTexts(rows, 1)).every((text) => text.toLowerCase().includes(name.toLowerCase()))).toBe(true);

  await rows.first().getByRole('link', { name, exact: true }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/player\/(pc|psn|xbl)\/[^/?]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('linked accounts: listed only as the source links them, with an empty state otherwise', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(LINKED, '?tab=linked'));
  const list = page.getByRole('list', { name: 'Linked accounts' });
  const account = list.getByRole('link', { name: /, open profile$/ }).first();
  await expect(account).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Links come from the data source, never from matching names.')).toBeVisible();
  const name = ((await account.getAttribute('aria-label')) ?? '').replace(/, open profile$/, '');
  await account.click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/player\/(pc|psn)\/[^/?]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });

  await page.goto(`${appUrl}/#${profileRoute(NO_LINKS, '?tab=linked')}`);
  await expect(page.getByText('No linked accounts', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('list', { name: 'Linked accounts' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('operators: most rounds first; sorting by K/D reorders the rows and moves aria-sort; the side filter', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(NO_LINKS, '?tab=operators'));
  const table = page.getByRole('table', { name: /^Operators, / });
  const rows = table.locator('tbody tr');
  await expect(rows.nth(2)).toBeVisible({ timeout: 15_000 });

  const rounds = table.getByRole('columnheader', { name: 'Rounds' });
  const kd = table.getByRole('columnheader', { name: 'K/D' });
  await expect(rounds).toHaveAttribute('aria-sort', 'descending');
  await expect(kd).toHaveAttribute('aria-sort', 'none');
  const byRounds = numbers(await columnTexts(rows, 3));
  expect(byRounds).toEqual([...byRounds].sort((a, b) => (b ?? 0) - (a ?? 0)));
  const namesBefore = await columnTexts(rows, 1);

  await kd.getByRole('button').click();
  await expect(kd).toHaveAttribute('aria-sort', 'descending');
  await expect(rounds).toHaveAttribute('aria-sort', 'none');
  const kds = numbers(await columnTexts(rows, 5));
  const known = kds.filter((n): n is number => n !== null);
  expect(known).toEqual([...known].sort((a, b) => b - a));
  expect(kds.slice(known.length).every((n) => n === null)).toBe(true); // unknown K/D stays last
  expect(await columnTexts(rows, 1)).not.toEqual(namesBefore);

  await kd.getByRole('button').click();
  await expect(kd).toHaveAttribute('aria-sort', 'ascending');

  await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: 'Defense' }).click();
  await expect.poll(() => hashParams(page).get('oside')).toBe('defense');
  await expect.poll(async () => [...new Set(await columnTexts(rows, 2))]).toEqual(['Defender']);
  expect(errors).toEqual([]);
});

test('seasons open their playlists; the maps season filter goes to the URL', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(NO_LINKS, '?tab=seasons'));
  const toggle = page.getByRole('button', { name: /^Playlists of / }).first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 15_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const breakdown = page.getByRole('table', { name: / by playlist$/ });
  await expect(breakdown.locator('tbody tr').first()).toBeVisible();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(breakdown).toHaveCount(0);

  await page.getByRole('tab', { name: 'Maps' }).click();
  await expect(page.getByRole('table', { name: /^Maps, / }).locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Season').selectOption('all');
  await expect.poll(() => hashParams(page).get('mseason')).toBe('all');
  await expect(page.getByRole('table', { name: 'Maps, all seasons' }).locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
