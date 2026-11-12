import type { HexColor } from '../types/primitives';

/** Colour maths for theme derivation. sRGB hex in, sRGB hex out; work happens in OKLCH. */

export type Rgb = readonly [number, number, number]; // 0..1, gamma-encoded sRGB
export interface Oklch {
  l: number; // 0..1
  c: number; // 0..~0.4
  h: number; // degrees 0..360
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function parseHex(hex: string): Rgb {
  const h = hex.replace(/^#/, '');
  const full = h.length === 3 ? h.replace(/./g, (ch) => ch + ch) : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex(rgb: Rgb): HexColor {
  const part = (v: number): string => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`.toUpperCase() as HexColor;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG 2 relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 contrast ratio, 1..21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function toOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: (h + 360) % 360 };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: readonly number[]): boolean => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** OKLCH to hex. Out-of-gamut colours keep lightness and hue and give up chroma. */
export function fromOklch(color: Oklch): HexColor {
  const l = clamp01(color.l);
  let lo = 0;
  let hi = Math.max(0, color.c);
  let lin = oklchToLinear({ l, c: hi, h: color.h });
  if (!inGamut(lin)) {
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l, c: mid, h: color.h }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ l, c: lo, h: color.h });
  }
  return toHex([toGamma(clamp01(lin[0])), toGamma(clamp01(lin[1])), toGamma(clamp01(lin[2]))]);
}

/** Linear blend in sRGB: 0 = a, 1 = b. */
export function mix(a: string, b: string, amount: number): HexColor {
  const x = parseHex(a);
  const y = parseHex(b);
  const t = clamp01(amount);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export const minContrast = (color: string, backgrounds: readonly string[]): number =>
  Math.min(...backgrounds.map((bg) => contrast(color, bg)));

/**
 * Moves a colour lighter or darker (hue kept, chroma given up only when the gamut forces it)
 * until it reaches `target` contrast against every background. Returns the input unchanged when
 * it already passes, and the extreme (white / black) when nothing in between does.
 */
export function ensureContrast(
  color: string,
  backgrounds: readonly string[],
  target: number,
  direction: 'lighter' | 'darker',
): HexColor {
  if (minContrast(color, backgrounds) >= target) return toHex(parseHex(color));
  const start = toOklch(color);
  const step = direction === 'lighter' ? 0.004 : -0.004;
  for (let l = start.l + step; l >= 0 && l <= 1; l += step) {
    const candidate = fromOklch({ ...start, l });
    if (minContrast(candidate, backgrounds) >= target) return candidate;
  }
  return direction === 'lighter' ? '#FFFFFF' : '#000000';
}

/** Smallest angle between two hues, 0..180. */
export const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
