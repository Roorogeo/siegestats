import type { IsoDateTime } from '@shared/types/primitives';
import { toIso, toMs } from '@shared/util/time';
import type { Clock } from '../ports';

export interface ManualClock extends Clock {
  /** Moves time forward (or back, with a negative value). */
  advance(ms: number): void;
  set(iso: IsoDateTime): void;
}

/**
 * A clock that only moves when told to: for tests, and for anything that needs a frozen "now".
 * sleep() moves the clock forward by the requested time and resolves at once, so code that waits runs instantly.
 */
export function createManualClock(start: IsoDateTime | string): ManualClock {
  let ms = toMs(start);
  if (Number.isNaN(ms)) throw new Error(`Not a date: ${start}`);
  return {
    now: () => toIso(ms),
    async sleep(delay) {
      if (delay > 0) ms += delay;
    },
    advance(delta) {
      ms += delta;
    },
    set(iso) {
      ms = toMs(iso);
    },
  };
}
