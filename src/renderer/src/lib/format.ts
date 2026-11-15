import type { Ratio } from '@shared/types/primitives';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@shared/util/time';

/**
 * Display formatting. Pure functions, no DOM: unit-tested in tests/unit/format.test.ts.
 * null means "the source does not expose this" (types/primitives.ts) and always renders as an en dash, never 0.
 * Numbers use one fixed locale so a column of figures looks the same on every machine; dates show local time.
 */

export const DASH = '–';

const NUMBER_LOCALE = 'en-US';
const DATE_LOCALE = 'en-GB';

const isNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(NUMBER_LOCALE, options);
    numberFormats.set(key, format);
  }
  return format;
}

/** 12,345 (thousands separators); `digits` decimals, fixed. */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (!isNumber(value)) return DASH;
  return numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** 950 / 12.9K / 773K / 1.2M, for axes and big totals. */
export function formatCompact(value: number | null | undefined): string {
  if (!isNumber(value)) return DASH;
  return numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** A ratio (0..1) as a percentage: 0.5423 -> "54.2%". */
export function formatRatio(value: Ratio | null | undefined, digits = 1): string {
  if (!isNumber(value)) return DASH;
  return `${formatNumber(value * 100, digits)}%`;
}

/** K/D and other per-unit ratios: 1.2345 -> "1.23". */
export const formatKd = (value: number | null | undefined): string => formatNumber(value, 2);

/** A signed change: "+24", "-18", "0". `format` writes the magnitude (default: thousands separators). */
export function formatDelta(value: number | null | undefined, format: (magnitude: number) => string = (n) => formatNumber(n)): string {
  if (!isNumber(value)) return DASH;
  const text = format(Math.abs(value));
  // A change that rounds to zero is written as no change, not "+0" or "-0".
  if (Number(text.replace(/[^0-9.]/g, '')) === 0) return text;
  return `${value > 0 ? '+' : '-'}${text}`;
}

/** Seconds as a clock: 1274 -> "21:14", 3723 -> "1:02:03". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!isNumber(seconds) || seconds < 0) return DASH;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export interface DateOptions {
  /** IANA zone; default the machine's own. Tests pass 'UTC'. */
  timeZone?: string;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();
function dateFormat(options: Intl.DateTimeFormatOptions, zone: DateOptions): Intl.DateTimeFormat {
  const all = zone.timeZone === undefined ? options : { ...options, timeZone: zone.timeZone };
  const key = JSON.stringify(all);
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(DATE_LOCALE, all);
    dateFormats.set(key, format);
  }
  return format;
}

const parse = (iso: string | null | undefined): number => (typeof iso === 'string' ? Date.parse(iso) : Number.NaN);

/** "3 Nov 2026". */
export function formatDate(iso: string | null | undefined, options: DateOptions = {}): string {
  const ms = parse(iso);
  if (Number.isNaN(ms)) return DASH;
  return dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }, options).format(ms);
}

/** "3 Nov", for chart axes. */
export function formatShortDate(iso: string | null | undefined, options: DateOptions = {}): string {
  const ms = parse(iso);
  if (Number.isNaN(ms)) return DASH;
  return dateFormat({ day: 'numeric', month: 'short' }, options).format(ms);
}

/** "3 Nov 2026, 14:05" (24-hour clock). */
export function formatDateTime(iso: string | null | undefined, options: DateOptions = {}): string {
  const ms = parse(iso);
  if (Number.isNaN(ms)) return DASH;
  const date = dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }, options).format(ms);
  const time = dateFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, options).format(ms);
  return `${date}, ${time}`;
}

/**
 * How long ago, from elapsed time: "just now" (under a minute, or a time slightly in the future), "3 min ago",
 * "2 h ago", "yesterday" (24 to 48 hours), "5 days ago", then the date from 7 days on.
 * `now` is epoch ms (from useNow()) or an ISO date.
 */
export function timeAgo(iso: string | null | undefined, now: number | string, options: DateOptions = {}): string {
  const then = parse(iso);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(current)) return DASH;
  const elapsed = current - then;
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} h ago`;
  if (elapsed < 2 * DAY_MS) return 'yesterday';
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)} days ago`;
  return formatDate(iso, options);
}

/** The "updated X ago" label: "Updated just now", "Updated 4 min ago", "Updated 3 Nov 2026". */
export function updatedAgo(iso: string | null | undefined, now: number | string, options: DateOptions = {}): string {
  return `Updated ${timeAgo(iso, now, options)}`;
}

/**
 * Up to two letters for an initials avatar: the first letters of the first two words of a handle
 * ("TidyOtter" -> "TO", "zenneljor_otter" -> "ZO"), or its first two letters ("Otter_919" -> "OT").
 * Digits count only when the handle has no letters at all.
 */
export function playerInitials(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
  const lettered = words.filter((word) => /^\p{L}/u.test(word));
  const pool = lettered.length > 0 ? lettered : words;
  const [first, second] = pool;
  if (!first) return '?';
  const letters = second ? `${[...first][0] ?? ''}${[...second][0] ?? ''}` : [...first].slice(0, 2).join('');
  return letters.toUpperCase();
}
