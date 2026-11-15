import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { OperatorDef, RankSystemDef } from '../../../src/shared/types/game-config';
import { expect, test } from './serve';

/** Phase 2 shared UI: the development gallery renders every component on the mock data; the new routes resolve. */

const read = <T>(file: string): T => JSON.parse(readFileSync(`config/game/${file}`, 'utf8')) as T;
const config = {
  rankSystems: read<{ rankSystems: RankSystemDef[] }>('rank-systems.json').rankSystems,
  operators: read<{ operators: OperatorDef[] }>('operators.json').operators,
};

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

/** Opens Home, then goes back to the gallery, waiting for each page to be on screen. */
async function leaveAndReturn(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Component gallery');
}

const chart = (page: Page) => page.getByRole('figure', { name: 'Ranked points after every match' });

test('the component gallery renders real mock data with no console errors', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/dev/components?themes=graphite');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Component gallery');

  // Every division of every ladder in the config has a badge named "<rank name>, <points> RP".
  for (const system of config.rankSystems) {
    for (const rank of [system.ranks[0], system.ranks.at(-1)]) {
      if (!rank) continue;
      const name = `${rank.name}, ${rank.minPoints.toLocaleString('en-US')} RP`;
      await expect(page.getByRole('img', { name, exact: true }).first()).toBeVisible();
    }
  }
  await expect(page.getByRole('img', { name: 'Unranked', exact: true }).first()).toBeVisible();
  const attacker = config.operators.find((o) => o.side === 'attack');
  if (attacker) await expect(page.getByRole('img', { name: `${attacker.name}, attacker`, exact: true }).first()).toBeVisible();

  // The chart preset draws the player's ranked season, with a crosshair tooltip and a table view.
  await expect(chart(page).locator('.recharts-line-curve')).toBeVisible({ timeout: 15_000 });
  await chart(page).scrollIntoViewIfNeeded();
  const plot = await chart(page).locator('.recharts-surface').boundingBox();
  if (!plot) throw new Error('chart has no box');
  await page.mouse.move(plot.x + plot.width * 0.6, plot.y + plot.height / 2);
  await expect(chart(page).locator('.recharts-tooltip-wrapper')).toContainText(/\d RP/);
  // The plot is a keyboard stop (Recharts' accessibility layer), so it carries the chart's name.
  await expect(chart(page).getByRole('application')).toHaveAccessibleName('Ranked points after every match');
  // The toggle names what it does next; no aria-pressed on top of a label that changes.
  const toggle = chart(page).getByRole('button', { name: 'Show table' });
  await expect(toggle).not.toHaveAttribute('aria-pressed');
  await toggle.click();
  const table = page.getByRole('table', { name: 'Ranked points after every match (table)' });
  await expect(table.locator('tbody tr').nth(1)).toBeVisible();
  await expect(chart(page).getByRole('button', { name: 'Show chart' })).toBeVisible();

  // Query states come from real AppErrors.
  await expect(page.getByText('Not available from this source').first()).toBeVisible();
  await expect(page.getByText('Not found', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('sortable headers report aria-sort, and a row opens the player with the keyboard', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/dev/components?themes=graphite');
  const board = page.getByRole('table', { name: 'Win-rate leaderboard' });
  await expect(board.locator('tbody tr').first()).toContainText(/\d%/, { timeout: 15_000 });

  const level = board.getByRole('columnheader', { name: 'Level' });
  await expect(level).toHaveAttribute('aria-sort', 'none');
  await level.getByRole('button').click();
  await expect(level).toHaveAttribute('aria-sort', 'descending');
  const levels = await board.locator('tbody tr td:nth-child(3)').allInnerTexts();
  const numbers = levels.map((text) => Number(text.replace(/,/g, '')));
  expect(numbers).toEqual([...numbers].sort((a, b) => b - a));

  const row = board.locator('tbody tr').first();
  // The Player cell: the avatar's initials, then the name.
  const name = (await row.locator('td').nth(1).innerText()).trim().split('\n').at(-1)?.trim() ?? '';
  expect(name).not.toBe('');
  await row.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/player\/(pc|psn|xbl)\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 15_000 });
  // The row went with the gallery: focus is on the profile's heading, not dropped to the document.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  expect(errors).toEqual([]);
});

test('player and match routes parse their links', async ({ page, appUrl }) => {
  // A well-formed link to a match the source does not know: the route parses it and the screen says so.
  const errors = await open(page, appUrl, '/match/m-abc123?pov=psn:p%2B1');
  await expect(page.getByRole('heading', { level: 1, name: 'Match not found' })).toBeVisible({ timeout: 15_000 });

  // A malformed player link (unknown platform) never reaches the source.
  await page.goto(`${appUrl}/#/player/switch/abc`);
  await expect(page.getByRole('heading', { level: 1, name: 'This player link is not valid' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Update bypasses the cache for the player, and the favourite star is saved', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/dev/components?themes=graphite');
  const card = page.getByRole('region', { name: 'Profile (data)' });
  await expect(card).toContainText('from source', { timeout: 15_000 });

  // Leave and come back: the query re-asks core, which answers from its 5-minute cache.
  await leaveAndReturn(page);
  await expect(card).toContainText('from cache', { timeout: 15_000 });

  // Update forces every per-player query of this player past the cache.
  await card.getByRole('button', { name: 'Update' }).click();
  await expect(card).toContainText('from source', { timeout: 15_000 });

  const star = card.getByRole('button', { name: 'Add favorite' });
  await star.click();
  await expect(card.getByRole('button', { name: 'Favorite', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await leaveAndReturn(page);
  await expect(card.getByRole('button', { name: 'Favorite', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('filter chips and segmented controls work from the keyboard', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/dev/components?themes=graphite');
  const chips = page.getByRole('group', { name: 'Playlists' });
  const all = chips.getByRole('button', { name: 'All' });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await all.focus();
  await page.keyboard.press('ArrowRight');
  const second = chips.getByRole('button').nth(1);
  await expect(second).toBeFocused();
  await page.keyboard.press('Space');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  // Turning the last chip off goes back to All.
  await page.keyboard.press('Space');
  await expect(all).toHaveAttribute('aria-pressed', 'true');

  const period = page.getByRole('radiogroup', { name: 'Period' });
  await period.getByRole('radio', { name: '30 days' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(period.getByRole('radio', { name: '90 days' })).toHaveAttribute('aria-checked', 'true');
  await expect(period.getByRole('radio', { name: '90 days' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(period.getByRole('radio', { name: 'Season' })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('a pressed filter chip writes its count in the text colour, which keeps 4.5:1 on the pressed fill', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/player/pc/17c92055-6505-482b-922b-f80b5a5c03a1');
  const chips = page.getByRole('group', { name: 'Playlists' });
  const chip = chips.getByRole('button').filter({ hasText: /\d/ }).first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  const count = chip.locator('.tabular');
  const colours = async (): Promise<{ count: string; text: string; muted: string }> =>
    count.evaluate((element) => {
      const probe = (token: string): string => {
        const span = document.createElement('span');
        span.style.color = `var(${token})`;
        document.body.append(span);
        const value = getComputedStyle(span).color;
        span.remove();
        return value;
      };
      return { count: getComputedStyle(element).color, text: probe('--text'), muted: probe('--text-muted') };
    });
  const before = await colours();
  expect(before.count).toBe(before.muted);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await colours()).count).toBe(before.text);
  expect(errors).toEqual([]);
});
