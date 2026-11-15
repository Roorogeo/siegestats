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
  await chart(page).getByRole('button', { name: 'Show table' }).click();
  const table = page.getByRole('table', { name: 'Ranked points after every match (table)' });
  await expect(table.locator('tbody tr').nth(1)).toBeVisible();

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

  await board.locator('tbody tr').first().focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/player\/(pc|psn|xbl)\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Player profile');
  expect(errors).toEqual([]);
});

test('player and match routes parse their links', async ({ page, appUrl }) => {
  const errors = await open(page, appUrl, '/match/m-abc123?pov=psn:p%2B1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Match details');
  await expect(page.getByText('Match m-abc123, seen by psn:p+1')).toBeVisible();

  await page.goto(`${appUrl}/#/player/switch/abc`);
  await expect(page.getByText('This player link is not valid')).toBeVisible();
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
