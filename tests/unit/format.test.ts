import { describe, expect, test } from 'vitest';
import {
  DASH, formatCompact, formatDate, formatDateTime, formatDelta, formatDuration, formatKd, formatNumber, formatRatio,
  formatShortDate, playerInitials, timeAgo, updatedAgo,
} from '@renderer/lib/format';

const UTC = { timeZone: 'UTC' };
const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('null and non-finite values render as an en dash, never 0', () => {
  test.each([
    ['formatNumber', formatNumber(null)],
    ['formatCompact', formatCompact(null)],
    ['formatRatio', formatRatio(null)],
    ['formatKd', formatKd(null)],
    ['formatDelta', formatDelta(null)],
    ['formatDuration', formatDuration(null)],
    ['formatDate', formatDate(null)],
    ['formatShortDate', formatShortDate(null)],
    ['formatDateTime', formatDateTime(null)],
    ['timeAgo', timeAgo(null, NOW)],
    ['NaN', formatNumber(Number.NaN)],
    ['Infinity', formatKd(Number.POSITIVE_INFINITY)],
    ['bad date', formatDate('not a date')],
  ])('%s', (_name, value) => {
    expect(value).toBe(DASH);
    expect(DASH).toBe('–');
  });
});

describe('numbers', () => {
  test('thousands separators and fixed decimals', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(-4321)).toBe('-4,321');
    expect(formatNumber(2.5, 1)).toBe('2.5');
    expect(formatNumber(1234.5)).toBe('1,235');
  });

  test('compact for axes and totals', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(12_900)).toBe('12.9K');
    expect(formatCompact(773_412)).toBe('773.4K');
    expect(formatCompact(1_200_000)).toBe('1.2M');
  });

  test('ratios as percentages, K/D with two decimals', () => {
    expect(formatRatio(0.5423)).toBe('54.2%');
    expect(formatRatio(0)).toBe('0.0%');
    expect(formatRatio(1)).toBe('100.0%');
    expect(formatRatio(0.5, 0)).toBe('50%');
    expect(formatKd(1.2345)).toBe('1.23');
    expect(formatKd(0)).toBe('0.00');
  });

  test('signed deltas: "+24", "-18", "0"', () => {
    expect(formatDelta(24)).toBe('+24');
    expect(formatDelta(-18)).toBe('-18');
    expect(formatDelta(0)).toBe('0');
    expect(formatDelta(1500)).toBe('+1,500');
    expect(formatDelta(0.042, (n) => formatRatio(n))).toBe('+4.2%');
    // Rounds to zero: written as no change, without a sign.
    expect(formatDelta(0.0004, (n) => formatNumber(n, 2))).toBe('0.00');
    expect(formatDelta(-0.2)).toBe('0');
  });

  test('durations as a clock', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(1274)).toBe('21:14');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe(DASH);
  });
});

describe('dates', () => {
  test('date, short date and date-time in the given zone', () => {
    expect(formatDate('2026-11-03T08:05:00.000Z', UTC)).toBe('3 Nov 2026');
    expect(formatShortDate('2026-11-03T08:05:00.000Z', UTC)).toBe('3 Nov');
    expect(formatDateTime('2026-11-03T08:05:00.000Z', UTC)).toBe('3 Nov 2026, 08:05');
    expect(formatDateTime('2026-11-03T23:30:00.000Z', { timeZone: 'Asia/Tokyo' })).toBe('4 Nov 2026, 08:30');
  });

  test('time ago: just now, minutes, hours, yesterday, days, then the date', () => {
    expect(timeAgo(ago(0), NOW)).toBe('just now');
    expect(timeAgo(ago(59_000), NOW)).toBe('just now');
    expect(timeAgo(ago(MIN), NOW)).toBe('1 min ago');
    expect(timeAgo(ago(3 * MIN + 20_000), NOW)).toBe('3 min ago');
    expect(timeAgo(ago(59 * MIN), NOW)).toBe('59 min ago');
    expect(timeAgo(ago(HOUR), NOW)).toBe('1 h ago');
    expect(timeAgo(ago(2 * HOUR + 30 * MIN), NOW)).toBe('2 h ago');
    expect(timeAgo(ago(23 * HOUR), NOW)).toBe('23 h ago');
    expect(timeAgo(ago(DAY), NOW)).toBe('yesterday');
    expect(timeAgo(ago(47 * HOUR), NOW)).toBe('yesterday');
    expect(timeAgo(ago(2 * DAY), NOW)).toBe('2 days ago');
    expect(timeAgo(ago(5 * DAY), NOW)).toBe('5 days ago');
    expect(timeAgo(ago(7 * DAY), NOW, UTC)).toBe('8 Nov 2026');
    expect(timeAgo(ago(400 * DAY), NOW, UTC)).toBe('11 Oct 2025');
  });

  test('a time slightly in the future (clock skew) is "just now"; now may be an ISO string', () => {
    expect(timeAgo(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe('just now');
    expect(timeAgo(ago(3 * HOUR), new Date(NOW).toISOString())).toBe('3 h ago');
  });

  test('updated X ago', () => {
    expect(updatedAgo(ago(10_000), NOW)).toBe('Updated just now');
    expect(updatedAgo(ago(4 * MIN), NOW)).toBe('Updated 4 min ago');
    expect(updatedAgo(ago(30 * DAY), NOW, UTC)).toBe('Updated 16 Oct 2026');
    expect(updatedAgo(null, NOW)).toBe(`Updated ${DASH}`);
  });
});

describe('player initials', () => {
  test.each([
    ['TidyOtter', 'TO'],
    ['zenneljor_otter', 'ZO'],
    ['Otter_919', 'OT'],
    ['Muffin.511', 'MU'],
    ['x', 'X'],
    ['42', '42'],
    ['__', '?'],
    ['élan vital', 'ÉV'],
  ])('%s -> %s', (name, initials) => {
    expect(playerInitials(name)).toBe(initials);
  });
});
