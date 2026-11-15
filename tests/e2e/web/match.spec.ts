import type { Locator, Page } from '@playwright/test';
import { expect, test } from './serve';

/**
 * Match details on the mock data. Match ids move with the clock (the mock places matches relative to today), so every
 * test reaches its match the way a user does: from a fixed account's match history ("View match" opens the match
 * from that player's point of view). The account comes from the seeded mock world and is the same on every run.
 */
const PLAYER = { platform: 'pc', id: '17c92055-6505-482b-922b-f80b5a5c03a1', name: 'LuhalAlt' } as const;
const DASH = '–';

/**
 * States the mock never produces, made from its real answers in the page: every match detail that core copies
 * through JSON is changed on its way. 'sparse' drops what a weaker source may not have (round data, damage, HS%,
 * assists, the opponents' identities) and turns the match into one recorded on this PC; 'fail-once' makes the first
 * answer a network error.
 */
type Mode = 'sparse' | 'fail-once';
async function alterMatches(page: Page, mode: Mode): Promise<void> {
  await page.addInitScript((m: Mode) => {
    const parse = JSON.parse;
    let failures = m === 'fail-once' ? 1 : 0;
    JSON.parse = function (this: unknown, text: string, reviver?: (key: string, value: unknown) => unknown): unknown {
      const value: unknown = parse.call(this, text, reviver);
      if (typeof value !== 'object' || value === null || !('teams' in value) || !('recorderSlot' in value)) return value;
      if (failures > 0) {
        failures -= 1;
        throw { code: 'network', message: 'The stats source did not answer.', retryAfterSec: null };
      }
      if (m === 'sparse') {
        const match = value as {
          rounds: unknown;
          origin: string;
          recorderSlot: number | null;
          teams: { id: string; players: { slot: number; damage: unknown; headshotPct: unknown; assists: unknown; player: unknown }[] }[];
        };
        match.rounds = null;
        match.origin = 'live';
        match.recorderSlot = null;
        for (const team of match.teams) {
          for (const player of team.players) {
            player.damage = null;
            player.headshotPct = null;
            player.assists = null;
          }
        }
      }
      return value;
    } as typeof JSON.parse;
  }, mode);
}

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

/** From LuhalAlt's profile, opens the newest match of the match history; resolves once the match is on screen. */
async function openMatchFromProfile(page: Page, appUrl: string): Promise<string[]> {
  const errors = await open(page, appUrl, `/player/${PLAYER.platform}/${PLAYER.id}`);
  const view = page.locator('a[href*="#/match/"]').first();
  await expect(view).toBeVisible({ timeout: 15_000 });
  await view.click();
  await expect.poll(() => hashOf(page)).toMatch(new RegExp(`^#/match/[^?]+\\?pov=${PLAYER.platform}:${PLAYER.id}$`));
  await loaded(page);
  return errors;
}

const loaded = async (page: Page): Promise<void> => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ on /, { timeout: 15_000 });
};

const scoreboard = (page: Page, name: string): Locator => page.getByRole('region', { name, exact: true });
const timeline = (page: Page): Locator => page.getByRole('table', { name: 'Round by round' });
const picks = (page: Page): Locator => page.getByRole('grid', { name: 'Operator picks per round' });

/** A table as text: header names (aria-label, else text) and every body row's cells. */
async function readTable(table: Locator): Promise<{ headers: string[]; rows: string[][] }> {
  return table.evaluate((element) => ({
    headers: [...element.querySelectorAll('thead th')].map((th) => th.getAttribute('aria-label') ?? th.textContent?.trim() ?? ''),
    rows: [...element.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td, th')].map((cell) => cell.textContent?.trim() ?? '')),
  }));
}

const toNumber = (text: string): number => Number(text.replace(/,/g, ''));

/** "Victory 4-2" -> [own, opponent] from the header. */
async function finalScore(page: Page): Promise<{ word: string; own: number; opponent: number }> {
  const text = (await page.getByTestId('match-result').textContent()) ?? '';
  const match = /^(Victory|Defeat|Draw) (\d+)-(\d+)$/.exec(text.trim());
  if (!match) throw new Error(`unexpected result text: ${text}`);
  return { word: match[1] ?? '', own: Number(match[2]), opponent: Number(match[3]) };
}

test('a match opened from a profile lists that player\'s team first, marks their row and links back', async ({ page, appUrl }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const errors = await openMatchFromProfile(page, appUrl);

  // Header: playlist and map, the result from LuhalAlt's side in words.
  const { word, own, opponent } = await finalScore(page);
  expect(word).toBe(own > opponent ? 'Victory' : own < opponent ? 'Defeat' : 'Draw');
  await expect(page.getByTestId('match-header')).toContainText(/Duration \d+:\d\d/);

  // "Your team" comes before "Opponents", and holds LuhalAlt's marked row.
  const mine = scoreboard(page, 'Your team');
  const theirs = scoreboard(page, 'Opponents');
  await expect(mine).toBeVisible();
  await expect(theirs).toBeVisible();
  const order = await page.locator('main section h2').allTextContents();
  expect(order.indexOf('Your team')).toBeLessThan(order.indexOf('Opponents'));
  await expect(mine.locator('tr[aria-current="true"]')).toContainText(PLAYER.name);
  await expect(mine).toContainText(`${own > opponent ? 'Won' : own < opponent ? 'Lost' : 'Drew'} ${own}-${opponent}`);

  // No horizontal page scroll at the smallest window.
  const overflow = await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The back link returns to the profile.
  await page.getByRole('link', { name: `Back to ${PLAYER.name}` }).click();
  await expect.poll(() => hashOf(page)).toBe(`#/player/${PLAYER.platform}/${PLAYER.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PLAYER.name, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('team totals are the sums of the player rows, and the scoreboards sort', async ({ page, appUrl }) => {
  const errors = await openMatchFromProfile(page, appUrl);
  for (const name of ['Your team', 'Opponents']) {
    const table = scoreboard(page, name).getByRole('table');
    const { headers, rows } = await readTable(table);
    const total = rows.at(-1) ?? [];
    expect(total[0]).toBe('Team total');
    const players = rows.slice(0, -1);
    expect(players).toHaveLength(5);
    for (const column of ['Kills', 'Deaths', 'Assists', 'Damage', 'Score']) {
      const index = headers.indexOf(column);
      expect(index, column).toBeGreaterThan(0);
      const sum = players.reduce((n, row) => n + toNumber(row[index] ?? ''), 0);
      expect(toNumber(total[index] ?? ''), `${name} ${column}`).toBe(sum);
    }
    // K/D of the total is total kills over total deaths.
    const kills = toNumber(total[headers.indexOf('Kills')] ?? '');
    const deaths = toNumber(total[headers.indexOf('Deaths')] ?? '');
    expect(total[headers.indexOf('K/D')]).toBe((kills / Math.max(deaths, 1)).toFixed(2));
  }

  // Sorting by kills: highest first, then lowest first; the totals row stays last either way.
  const board = scoreboard(page, 'Your team');
  const kills = board.getByRole('columnheader', { name: 'Kills' });
  await kills.getByRole('button').click();
  await expect(kills).toHaveAttribute('aria-sort', 'descending');
  let { headers, rows } = await readTable(board.getByRole('table'));
  let column = rows.slice(0, -1).map((row) => toNumber(row[headers.indexOf('Kills')] ?? ''));
  expect(column).toEqual([...column].sort((a, b) => b - a));
  expect(rows.at(-1)?.[0]).toBe('Team total');
  await kills.getByRole('button').click();
  await expect(kills).toHaveAttribute('aria-sort', 'ascending');
  ({ headers, rows } = await readTable(board.getByRole('table')));
  column = rows.slice(0, -1).map((row) => toNumber(row[headers.indexOf('Kills')] ?? ''));
  expect(column).toEqual([...column].sort((a, b) => a - b));
  expect(rows.at(-1)?.[0]).toBe('Team total');
  expect(errors).toEqual([]);
});

test('the timeline has one column per round played, and its winners add up to the final score', async ({ page, appUrl }) => {
  const errors = await openMatchFromProfile(page, appUrl);
  const { own, opponent } = await finalScore(page);
  const { rows } = await readTable(timeline(page));
  const [result, side, ended, score] = rows;
  if (!result || !side || !ended || !score) throw new Error('timeline rows missing');
  expect(result[0]).toBe('Result');
  const rounds = result.slice(1);
  expect(rounds).toHaveLength(own + opponent);
  expect(rounds.filter((cell) => cell === 'Won')).toHaveLength(own);
  expect(rounds.filter((cell) => cell === 'Lost')).toHaveLength(opponent);
  for (const cell of side.slice(1)) expect(['Attack', 'Defense']).toContain(cell);
  for (const cell of ended.slice(1)) expect(cell).not.toBe('');
  // The running score ends on the final score.
  expect(score.at(-1)).toBe(`${own}-${opponent}`);
  expect(errors).toEqual([]);
});

test('the picks grid has a cell per player and round, and attack picks only on attacking rounds', async ({ page, appUrl }) => {
  const errors = await openMatchFromProfile(page, appUrl);
  const { rows } = await readTable(timeline(page));
  const sides = (rows[1] ?? []).slice(1);
  const grid = picks(page);
  await expect(grid.getByRole('gridcell')).toHaveCount(10 * sides.length);

  // Each player's pick per round: the operator badge's name ("Ash, attacker"), or nothing for "no pick".
  const cells = await grid.evaluate((element) =>
    [...element.querySelectorAll('tbody tr[data-team]')].map((tr, index) => ({
      first: index < 5,
      picks: [...tr.querySelectorAll('[role="gridcell"]')].map((cell) => cell.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null),
    })),
  );
  expect(cells).toHaveLength(10);
  for (const row of cells) {
    row.picks.forEach((pick, round) => {
      if (pick === null) return;
      const mineAttacking = sides[round] === 'Attack';
      const attacking = row.first ? mineAttacking : !mineAttacking;
      expect(pick, `round ${round + 1}`).toMatch(attacking ? /, attacker$/ : /, defender$/);
    });
  }
  expect(errors).toEqual([]);
});

test('the picks grid works from the keyboard and names the focused pick', async ({ page, appUrl }) => {
  const errors = await openMatchFromProfile(page, appUrl);
  const grid = picks(page);
  const cells = grid.getByRole('gridcell');
  // One tab stop for the whole grid.
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await cells.first().focus();
  await page.keyboard.press('ArrowRight');
  const second = cells.nth(1);
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('tabindex', '0');
  const label = (await second.getByRole('img').getAttribute('aria-label')) ?? '';
  const operator = label.split(',')[0] ?? '';
  expect(operator).not.toBe('');
  await expect(second).toContainText(operator);
  await expect(second).toContainText('Round 2');
  // Down moves to the next player in the same round; End to the last round.
  await page.keyboard.press('ArrowDown');
  await expect(grid.locator('[data-cell="1:1"]')).toBeFocused();
  await page.keyboard.press('End');
  const rounds = await grid.locator('thead th').count();
  await expect(grid.locator(`[data-cell="1:${rounds - 2}"]`)).toBeFocused();
  expect(errors).toEqual([]);
});

test('a player name in a scoreboard opens that profile', async ({ page, appUrl }) => {
  const errors = await openMatchFromProfile(page, appUrl);
  const link = scoreboard(page, 'Opponents').getByRole('link').first();
  const name = (await link.textContent()) ?? '';
  await link.click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/player\/(pc|psn|xbl)\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('without a point of view the teams are Blue and Orange, blue first', async ({ page, appUrl }) => {
  const errors = await openMatchFromProfile(page, appUrl);
  const route = hashOf(page).slice(1).replace(/\?.*$/, '');
  await page.evaluate((path) => {
    window.location.hash = path;
  }, route);
  await expect(scoreboard(page, 'Blue')).toBeVisible({ timeout: 15_000 });
  await expect(scoreboard(page, 'Orange')).toBeVisible();
  const order = await page.locator('main section h2').allTextContents();
  expect(order.indexOf('Blue')).toBeLessThan(order.indexOf('Orange'));
  await expect(page.getByTestId('match-result')).toHaveText(/^Blue \d+-\d+ Orange$/);
  await expect(page.locator('main tr[aria-current="true"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Back to/ })).toHaveCount(0);
  const { rows } = await readTable(timeline(page));
  expect(rows[0]?.[0]).toBe('Winner');
  for (const cell of (rows[0] ?? []).slice(1)) expect(['Blue', 'Orange']).toContain(cell);
  expect(errors).toEqual([]);
});

test('an unknown match id shows "Match not found" with a way back', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, `/match/m-does-not-exist?pov=${PLAYER.platform}:${PLAYER.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Match not found', { timeout: 15_000 });
  await page.getByRole('link', { name: 'Back to the profile' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PLAYER.name, { timeout: 15_000 });

  await open(page, appUrl, '/match/m-does-not-exist');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Match not found', { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('unknown values show as dashes, and missing round data as an empty state', async ({ page, appUrl }) => {
  await alterMatches(page, 'sparse');
  const errors = await openMatchFromProfile(page, appUrl);
  await expect(page.getByTestId('match-header')).toContainText('Recorded on this PC');
  const board = scoreboard(page, 'Your team').getByRole('table');
  const { headers, rows } = await readTable(board);
  for (const column of ['Assists', 'Headshot percentage', 'Damage']) {
    const index = headers.indexOf(column);
    for (const row of rows) expect(row[index], column).toBe(DASH);
  }
  // Known values still add up.
  const kills = headers.indexOf('Kills');
  expect(toNumber(rows.at(-1)?.[kills] ?? '')).toBe(rows.slice(0, -1).reduce((n, row) => n + toNumber(row[kills] ?? ''), 0));
  await expect(page.getByRole('region', { name: 'Round by round' })).toContainText('This source has no round data for this match');
  await expect(page.getByRole('region', { name: 'Operator picks per round' })).toContainText('No operator picks');
  expect(errors).toEqual([]);
});

test('a failed load offers Retry, which loads the match', async ({ page, appUrl }) => {
  await alterMatches(page, 'fail-once');
  const errors = await open(page, appUrl, `/player/${PLAYER.platform}/${PLAYER.id}`);
  const view = page.locator('a[href*="#/match/"]').first();
  await expect(view).toBeVisible({ timeout: 15_000 });
  await view.click();
  const alert = page.getByRole('alert').filter({ hasText: 'This match could not be loaded' });
  await expect(alert).toContainText('This match could not be loaded', { timeout: 15_000 });
  await expect(alert).toContainText('The stats source did not answer.');
  await expect(page.getByRole('link', { name: `Back to the profile` })).toBeVisible();
  await alert.getByRole('button', { name: 'Retry' }).click();
  await loaded(page);
  await expect(scoreboard(page, 'Your team')).toBeVisible();
  expect(errors).toEqual([]);
});
