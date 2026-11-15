/**
 * JSON with a stable key order at every depth, so two requests that mean the same thing produce the same
 * cache key whatever order their fields were written in. Arrays keep their order; undefined values are
 * dropped, as JSON.stringify drops them.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? 'null';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : sortKeys(item)));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) out[key] = sortKeys(item);
  }
  return out;
}

/** A deep copy through JSON: whatever comes out is plain JSON-safe data that shares nothing with the input. */
export function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
