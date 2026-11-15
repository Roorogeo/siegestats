/**
 * Seeded pseudo-random numbers: sfc32 seeded through a 32-bit string hash. Pure integer maths, so the same
 * seed gives the same sequence on every machine and in every JavaScript engine. Never use Math.random in
 * generated data.
 */

export interface Random {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniform in [min, max). */
  float(min: number, max: number): number;
  /** true with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks an item with probability proportional to its weight. Non-positive weights are never picked. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** A shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** Normally distributed (Box-Muller). */
  normal(mean?: number, sd?: number): number;
  /** An independent stream derived from this one's seed and a label; it does not advance this stream. */
  fork(label: string | number): Random;
}

/** xmur3-style 32-bit hash of any number of parts. */
export function hashSeed(...parts: readonly (string | number)[]): number {
  const text = parts.map(String).join('␟');
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRandom(seed: string | number): Random {
  const key = String(seed);
  const next = sfc32(hashSeed(key, 'a'), hashSeed(key, 'b'), hashSeed(key, 'c'), hashSeed(key, 'd'));
  // Warm up: the first outputs of sfc32 are weakly mixed.
  for (let i = 0; i < 12; i += 1) next();

  const random: Random = {
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick(items) {
      if (items.length === 0) throw new Error('pick() from an empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted(items) {
      let total = 0;
      for (const [, w] of items) if (w > 0) total += w;
      if (total <= 0) throw new Error('weighted() needs at least one positive weight');
      let roll = next() * total;
      for (const [item, w] of items) {
        if (w <= 0) continue;
        roll -= w;
        if (roll < 0) return item;
      }
      // Floating-point leftovers: the last positive item.
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const entry = items[i];
        if (entry && entry[1] > 0) return entry[0];
      }
      throw new Error('unreachable');
    },
    shuffle(items) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i] as (typeof copy)[number];
        copy[i] = copy[j] as (typeof copy)[number];
        copy[j] = tmp;
      }
      return copy;
    },
    normal(mean = 0, sd = 1) {
      const u = 1 - next(); // (0, 1]: log(0) never happens
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    fork: (label) => createRandom(`${key}/${String(label)}`),
  };
  return random;
}
