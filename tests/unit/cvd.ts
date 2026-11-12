/**
 * Colour-vision-deficiency simulation and OKLab distance, for the chart-palette tests.
 * Machado, Oliveira & Fernandes (2009) matrices at severity 1.0, applied in linear RGB.
 * Delta E is Euclidean distance in OKLab x 100; the thresholds in the tests are calibrated to this model.
 */
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

type Vec = [number, number, number];

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function linear(hex: string): Vec {
  const n = parseInt(hex.replace('#', ''), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

function oklab([r, g, b]: Vec): Vec {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate(rgb: Vec, kind: keyof typeof MACHADO): Vec {
  const m = MACHADO[kind];
  const row = (i: 0 | 1 | 2): number =>
    Math.min(1, Math.max(0, m[i][0] * rgb[0] + m[i][1] * rgb[1] + m[i][2] * rgb[2]));
  return [row(0), row(1), row(2)];
}

const distance = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;

/** OKLab distance x 100 under normal vision. */
export const deltaE = (a: string, b: string): number => distance(oklab(linear(a)), oklab(linear(b)));

/** The smaller of the protan and deutan distances: how far apart two colours stay for red-green colour-blind readers. */
export function cvdDeltaE(a: string, b: string): number {
  const d = (kind: keyof typeof MACHADO): number =>
    distance(oklab(simulate(linear(a), kind)), oklab(simulate(linear(b), kind)));
  return Math.min(d('protan'), d('deutan'));
}
