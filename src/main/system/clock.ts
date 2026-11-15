import type { Clock } from '@core/ports';
import type { IsoDateTime } from '@shared/types/primitives';

/** The real clock core runs on in the app: system time and timers, which core itself may not touch. */
export const systemClock: Clock = {
  now: () => new Date().toISOString() as IsoDateTime,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))),
};
