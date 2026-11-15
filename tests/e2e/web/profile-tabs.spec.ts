import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SeasonDef } from '../../../src/shared/types/game-config';
import { expect, test, TEST_NOW } from './serve';

/**
 * The profile's match history and its Seasons, Encounters, Operators, Maps and Linked accounts tabs, on the mock
 * data. The mock's accounts depend only on its fixed seed and the game config, never on the clock (data layer
 * decisions), so the accounts below exist on every run. Their matches and stats do move with the clock, which
 * serve.ts pins to TEST_NOW; even so, nothing below depends on a particular count.
 */
const NO_LINKS = { platform: 'psn', id: '23d397de-821a-4d1c-9c72-39b1826d2a87' } as const; // TinyFerret: ~90 matches, no linked accounts
const LINKED = { platform: 'xbl', id: 'd9fadf8d-d614-4d1b-a57f-b0facec05e39' } as const; // GaryorJr: linked to a PC account
const PLACEMENTS = { platform: 'pc', id: '3e7b27a1-3c75-4430-b770-2aed61b8a03b' } as const; // Zalvok: ranked matches, no rank yet

const DAY_MS = 86_400_000;
const seasons = (JSON.parse(readFileSync('config/game/seasons.json', 'utf8')) as { seasons: SeasonDef[] }).seasons;
/** The season a match date falls in ([startsAt, endsAt); the last season is open-ended). */
const seasonAt = (iso: string): SeasonDef | undefined => seasons.find((s) => s.startsAt <= iso && (s.endsAt === null || iso < s.endsAt));

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

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The visible part of a summary value (the screen-reader text after it is left out). */
const summaryValue = (page: Page, label: string): Locator =>
  page.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${escapeRegExp(label)}$`) }) }).locator('dd');

/** The playlist chips with their match counts ("Ranked 21" -> ['Ranked', 21]); All has no count. */
const chipCounts = async (page: Page): Promise<[string, number][]> =>
  (await page.getByRole('group', { name: 'Playlists' }).getByRole('button').allInnerTexts()).flatMap((text) => {
    const match = /^(.*\S)\s+(\d+)$/.exec(text.trim());
    return match ? [[match[1] ?? '', Number(match[2])] as [string, number]] : [];
  });

/** The total of "Showing 20 of 135 matches". */
const shownTotal = async (page: Page): Promise<number> =>
  Number(/of (\d+) match/.exec(await page.getByText(/^Showing \d+ of \d+ match(es)?$/).innerText())?.[1]);

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
  const table = page.getByRole('table', { name: 'Match history' });
  await expect(table).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });

  // The chips come with the first page (the summary's per-playlist counts): only playlists played in the period,
  // and their counts add up to the period's matches.
  const counts = await chipCounts(page);
  expect(counts.length).toBeGreaterThan(1);
  expect(counts.every(([, n]) => n > 0)).toBe(true);
  expect(counts.reduce((sum, [, n]) => sum + n, 0)).toBe(await shownTotal(page));
  const rankedCount = counts.find(([name]) => name === 'Ranked')?.[1];
  expect(rankedCount).toBeGreaterThan(0);

  const chips = page.getByRole('group', { name: 'Playlists' });
  const ranked = chips.getByRole('button', { name: /^Ranked/ });
  await ranked.click();
  await expect.poll(() => hashParams(page).get('hp')).toBe('ranked');
  await expect.poll(async () => [...new Set(await columnTexts(rows, 1))], { timeout: 15_000 }).toEqual(['Ranked']);
  // Filtered to Ranked, the history holds exactly the Ranked chip's count, and the chips keep the period's counts.
  await expect(table).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
  expect(await shownTotal(page)).toBe(rankedCount);
  expect(await chipCounts(page)).toEqual(counts);

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

test('Load more appends pages, keeps keyboard focus on the new rows, and the summary row agrees with every loaded row', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(NO_LINKS, '?hperiod=90'));
  const rows = historyRows(page);
  await expect(rows.first()).toContainText('View match', { timeout: 15_000 });
  const status = page.getByText(/^Showing \d+ of \d+ match(es)?$/);
  await expect(status).toHaveText(/^Showing 20 of \d+ matches$/);
  const total = Number(/of (\d+)/.exec(await status.innerText())?.[1]);
  expect(total).toBeGreaterThan(20);

  // From the keyboard. Focus then moves to the first new row's "View match", also when the last page takes the
  // button away.
  const loadMore = page.getByRole('button', { name: /^Load \d+ more$/ });
  const focusedRow = (): Promise<number> => rows.evaluateAll((trs) => trs.findIndex((tr) => tr.contains(document.activeElement)));
  for (let shown = 20; shown < total; ) {
    const before = shown;
    await loadMore.press('Enter');
    shown = Math.min(shown + 20, total);
    await expect(rows).toHaveCount(shown, { timeout: 15_000 });
    const firstLinked = await rows.evaluateAll((trs, from) => trs.findIndex((tr, i) => i >= from && tr.querySelector('a[href]') !== null), before);
    await expect.poll(focusedRow).toBe(firstLinked);
    await expect(page.locator(':focus')).toHaveAccessibleName(/^View match: /);
  }
  await expect(loadMore).toHaveCount(0);
  await expect(status).toHaveText(`Showing ${total} of ${total} matches`);

  const modes = await columnTexts(rows, 1);
  const dates = await rows.evaluateAll((trs) => trs.map((tr) => tr.querySelector('td:nth-child(3) time')?.getAttribute('datetime') ?? ''));
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

  await expect(summaryValue(page, 'Matches')).toHaveText(String(total));
  await expect(summaryValue(page, 'Streak').locator('[aria-hidden="true"]')).toHaveText(`${first === 'Win' ? 'W' : 'L'}${streak}`);
  await expect(summaryValue(page, 'Win rate')).toHaveText(`${fixed(1).format((wins / (wins + losses)) * 100)}%`);
  await expect(summaryValue(page, 'K/D')).toHaveText(fixed(2).format(kills / Math.max(deaths, 1)));
  await expect(summaryValue(page, 'Kills per match')).toHaveText(fixed(1).format(kills / total));

  // The RP change is the Ranked ladder's, counted only inside the season of the newest ranked match: a season
  // reset starts it again. 90 days reach back past that season's start, so the label names the season.
  const ranked = modes.flatMap((mode, i) => (mode === 'Ranked' ? [{ season: seasonAt(dates[i] ?? '')?.id, change: numbers([changes[i] ?? ''])[0] ?? null }] : []));
  expect(ranked.length).toBeGreaterThan(0);
  const newest = seasons.find((s) => s.id === ranked[0]?.season);
  expect(newest).toBeDefined();
  const rp = ranked.filter((r) => r.season === newest?.id).reduce((sum, r) => sum + (r.change ?? 0), 0);
  const periodStart = new Date(Date.parse(TEST_NOW) - 90 * DAY_MS).toISOString();
  const label = periodStart < (newest?.startsAt ?? '') ? `RP change (${newest?.id})` : 'RP change';
  const text = rp === 0 ? '0' : `${rp > 0 ? '+' : '-'}${fixed(0).format(Math.abs(rp))}`;
  await expect(summaryValue(page, label).locator('[aria-hidden="true"]').first()).toHaveText(text);

  // The Season period is that season itself: no name in the label.
  await page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: 'Season' }).click();
  await expect(page.getByRole('table', { name: 'Match history' })).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
  await expect(summaryValue(page, 'RP change')).toBeVisible();
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
  // The link's name is its visible content: handle, platform, "Open profile".
  const account = list.getByRole('link', { name: /^\S+ (PC|PlayStation) Open profile$/ }).first();
  await expect(account).toBeVisible({ timeout: 15_000 });
  await expect(account).not.toHaveAttribute('aria-label');
  await expect(page.getByText('Links come from the data source, never from matching names.')).toBeVisible();
  const name = (await account.locator('span.truncate').innerText()).trim();
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
  await expect(toggle).not.toHaveAttribute('aria-controls');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const breakdown = page.getByRole('table', { name: / by playlist$/ });
  await expect(breakdown.locator('tbody tr').first()).toBeVisible();
  // The button names the detail row it opened.
  const controls = (await toggle.getAttribute('aria-controls')) ?? '';
  expect(controls).not.toBe('');
  await expect(page.locator(`[id="${controls}"]`).getByRole('table', { name: / by playlist$/ })).toBeVisible();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(breakdown).toHaveCount(0);
  await toggle.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.press('Space');
  await expect(breakdown).toHaveCount(0);

  // Every season's matches, from the Seasons table (the disclosure column comes first).
  const lifetime = numbers(await columnTexts(page.getByRole('table', { name: 'Seasons' }).locator('tbody > tr:has(button[aria-expanded])'), 5));
  const allMatches = lifetime.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  expect(allMatches).toBeGreaterThan(0);

  await page.getByRole('tab', { name: 'Maps' }).click();
  await expect(page.getByRole('table', { name: /^Maps, / }).locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Season').selectOption('all');
  await expect.poll(() => hashParams(page).get('mseason')).toBe('all');
  await expect(page.getByRole('table', { name: 'Maps, all seasons' }).locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('table', { name: 'Maps, all seasons' })).not.toHaveAttribute('aria-busy', 'true');

  // A per-map breakdown that covers less than the seasons hold says so under the table; a complete one does not.
  const footer = page.getByText(/^\d+ maps?, [\d,]+ match(es)?$/);
  const mapMatches = Number(/, ([\d,]+) match/.exec(await footer.innerText())?.[1]?.replace(/,/g, ''));
  const note = page.getByText(/^Covers [\d,]+ of [\d,]+ matches: /);
  if (mapMatches < allMatches) {
    await expect(note).toHaveText(`Covers ${fixed(0).format(mapMatches)} of ${fixed(0).format(allMatches)} matches: the data source has no per-map breakdown for some seasons.`);
  } else {
    expect(mapMatches).toBe(allMatches);
    await expect(note).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('a player in placements reads the same on Overview, Peak ranks and the Seasons tab', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, profileRoute(PLACEMENTS));
  const current = page.getByRole('region', { name: 'Current season' });
  await expect(current.getByRole('group', { name: 'Rank' })).toContainText('In placements', { timeout: 15_000 });
  const peaks = page.getByRole('list', { name: 'Seasons' }).getByRole('listitem').filter({ hasText: 'Current season' });
  await expect(peaks).toContainText('In placements', { timeout: 15_000 });

  await page.getByRole('tab', { name: 'Seasons' }).click();
  const currentRow = page.getByRole('table', { name: 'Seasons' }).locator('tbody tr').filter({ hasText: 'Current' });
  await expect(currentRow).toHaveCount(1, { timeout: 15_000 });
  // Final and peak rank both say placements, not "Unranked".
  await expect(currentRow.locator('td', { hasText: 'In placements' })).toHaveCount(2);
  await expect(currentRow).not.toContainText('Unranked');
  // So does the Ranked line of its playlist breakdown.
  await currentRow.getByRole('button', { name: /^Playlists of / }).click();
  const rankedLine = page.getByRole('table', { name: / by playlist$/ }).locator('tbody tr').filter({ hasText: /^Ranked/ });
  await expect(rankedLine.locator('td', { hasText: 'In placements' })).toHaveCount(2);
  expect(errors).toEqual([]);
});
