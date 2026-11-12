import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';

/**
 * "Every color in the app comes from theme tokens."
 * The UI may only name colours through the theme variables (Tailwind utilities such as bg-surface,
 * or var(--accent)). A hex code, rgb(), hsl() or oklch() in renderer source breaks that rule.
 */
const ROOT = join(process.cwd(), 'src/renderer');
const PATTERNS: [RegExp, string][] = [
  [/#[0-9a-fA-F]{3,8}\b/g, 'hex colour'],
  [/\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g, 'colour function'],
  [/\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|shadow|divide|decoration|accent|caret)-(?:white|black)\b/g, 'black/white utility'],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css|html)$/.test(name) ? [path] : [];
  });
}

test('renderer source contains no colour literals', () => {
  const offences: string[] = [];
  for (const file of files(ROOT)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      // `color-mix(in oklab, var(--x) ...)` mixes tokens; it names a colour space, not a colour.
      const code = line.replace(/color-mix\(in (?:oklab|oklch|srgb|lab|lch|hsl|hwb)/g, 'color-mix(');
      for (const [pattern, what] of PATTERNS) {
        for (const match of code.matchAll(pattern)) {
          offences.push(`${relative(process.cwd(), file)}:${index + 1} ${what}: ${match[0]}`);
        }
      }
    });
  }
  expect(offences).toEqual([]);
});
