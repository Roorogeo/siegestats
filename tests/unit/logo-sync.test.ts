import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/** The in-app logo (theme colours) and the static logo / icon files (fixed colours) must draw the same mark. */
const read = (path: string): string => readFileSync(path, 'utf8');
const geometry = (source: string) => ({
  circle: /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="([\d.]+)"/.exec(source)?.slice(1),
  path: /\sd="([^"]+)"/.exec(source)?.[1],
});

test('Logo.tsx, logo.svg and icon.svg share one geometry', () => {
  const component = geometry(read('src/renderer/src/ui/Logo.tsx'));
  expect(component.circle).toBeDefined();
  expect(component.path).toBeDefined();
  expect(geometry(read('resources/logo.svg'))).toEqual(component);
  // icon.svg places the mark on a plate with a transform, so only the drawing itself is compared.
  const icon = read('resources/icon.svg');
  expect(icon).toContain(`d="${component.path}"`);
});
