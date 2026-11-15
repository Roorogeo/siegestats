import type { IsoDateTime } from '../types/primitives';

/** Pure date helpers. Nothing here reads the current time: that only comes from core's Clock port. */

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Strict UTC ISO-8601, the only form an IsoDateTime takes: 2026-11-15T09:30:00.000Z (milliseconds optional). */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isIsoDateTime(value: unknown): value is IsoDateTime {
  return typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

/** Milliseconds since the epoch. NaN for anything that is not a date. */
export const toMs = (iso: string): number => Date.parse(iso);

export const toIso = (ms: number): IsoDateTime => new Date(ms).toISOString() as IsoDateTime;

export const addMs = (iso: IsoDateTime, ms: number): IsoDateTime => toIso(toMs(iso) + ms);
