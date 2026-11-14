// Regenerates the raster app icons from the SVG sources in resources/.
//
//   node scripts/build-icons.mjs [--png-dir <dir>]
//
// Sources (hand-written, commit these):
//   resources/icon.svg         the full icon, used for 48 px and up
//   resources/icon-small.svg   the same mark redrawn on a 16 grid, used for 32 px and below
// Outputs (generated, commit these too):
//   resources/icon.png         512 x 512
//   resources/icon.ico         16, 24, 32, 48, 64, 128, 256 (PNG-compressed entries)
//   resources/tray.png         32 x 32  (tray icon, 1x; Windows shows it at 16 logical px)
//   resources/tray@2x.png      64 x 64  (tray icon, 2x)
// --png-dir also writes every rendered size as <size>.png into that folder, to look at them.
//
// Rendering uses Playwright's bundled Chromium (already a dev dependency): each SVG is drawn as an <img> at its exact
// pixel size on a transparent page. The ICO container is written by hand and parsed back as a check.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'resources');
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SMALL_MAX = 32; // at and below this size the small, pixel-aligned drawing is used
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const args = process.argv.slice(2);
const pngDirArg = args[args.indexOf('--png-dir') + 1];
const pngDir = args.includes('--png-dir') && pngDirArg ? path.resolve(pngDirArg) : null;

const svgSource = (name) => fs.readFileSync(path.join(RES, name), 'utf8');
const SOURCES = { large: svgSource('icon.svg'), small: svgSource('icon-small.svg') };
const sourceFor = (size) => (size <= SMALL_MAX ? SOURCES.small : SOURCES.large);
// The tray pair is one drawing at 1x and 2x, so both come from the small source (64 px would otherwise use icon.svg).
const TRAY_SIZES = [32, 64];

/** Width and height from a PNG's IHDR chunk (bytes 16-23). */
function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Renders each [svg, size] job; returns the PNGs in the same order. */
async function render(jobs) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
    const out = [];
    for (const [svg, size] of jobs) {
      const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block}</style></head>` +
          `<body><img width="${size}" height="${size}" src="${src}" alt=""></body></html>`,
      );
      await page.locator('img').evaluate((img) => img.decode());
      const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      const { width, height } = pngSize(png);
      if (width !== size || height !== size) throw new Error(`rendered ${width}x${height}, wanted ${size}x${size}`);
      out.push(png);
    }
    return out;
  } finally {
    await browser.close();
  }
}

/**
 * ICO container: ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per image + the PNG payloads.
 * Width/height are one byte each; 0 means 256. PNG payloads are valid in ICO since Windows Vista.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // payload size
    entry.writeUInt32LE(offset, 12); // payload offset
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/** Parses an ICO back and checks every entry against its PNG payload. Returns the sizes found. */
function verifyIco(buf, expectedSizes) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('ICO: bad ICONDIR header');
  const count = buf.readUInt16LE(4);
  if (count !== expectedSizes.length) throw new Error(`ICO: ${count} entries, expected ${expectedSizes.length}`);
  const found = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + 16 * i;
    const width = buf.readUInt8(at) || 256;
    const height = buf.readUInt8(at + 1) || 256;
    const length = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    if (offset + length > buf.length) throw new Error(`ICO: entry ${i} runs past the end of the file`);
    const payload = buf.subarray(offset, offset + length);
    if (!payload.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`ICO: entry ${i} is not a PNG`);
    const png = pngSize(payload);
    if (png.width !== width || png.height !== height) {
      throw new Error(`ICO: entry ${i} says ${width}x${height} but its PNG is ${png.width}x${png.height}`);
    }
    found.push({ width, length });
  }
  const sizes = found.map((entry) => entry.width);
  if (sizes.join() !== expectedSizes.join()) throw new Error(`ICO: sizes ${sizes.join()} != ${expectedSizes.join()}`);
  return found;
}

const pngs = await render([...SIZES.map((size) => [sourceFor(size), size]), ...TRAY_SIZES.map((size) => [SOURCES.small, size])]);
const rendered = new Map(SIZES.map((size, i) => [size, pngs[i]]));
const tray = new Map(TRAY_SIZES.map((size, i) => [size, pngs[SIZES.length + i]]));
const pick = (map, size) => {
  const png = map.get(size);
  if (!png) throw new Error(`no render at ${size}px`);
  return png;
};
const at = (size) => pick(rendered, size);

const ico = buildIco(ICO_SIZES.map((size) => ({ size, png: at(size) })));
const outputs = [
  ['icon.png', at(512)],
  ['icon.ico', ico],
  ['tray.png', pick(tray, 32)],
  ['tray@2x.png', pick(tray, 64)],
];
for (const [name, buf] of outputs) fs.writeFileSync(path.join(RES, name), buf);
if (pngDir) {
  fs.mkdirSync(pngDir, { recursive: true });
  for (const [size, png] of rendered) fs.writeFileSync(path.join(pngDir, `${size}.png`), png);
  for (const [size, png] of tray) fs.writeFileSync(path.join(pngDir, `tray-${size}.png`), png);
}

// Read the files back from disk, so the check covers what was actually written.
const entries = verifyIco(fs.readFileSync(path.join(RES, 'icon.ico')), ICO_SIZES);
for (const [name, size] of [['icon.png', 512], ['tray.png', 32], ['tray@2x.png', 64]]) {
  const { width, height } = pngSize(fs.readFileSync(path.join(RES, name)));
  if (width !== size || height !== size) throw new Error(`${name} is ${width}x${height}, expected ${size}x${size}`);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`icon.ico  ${entries.length} PNG entries, ${kb(ico.length)}`);
for (const { width, length } of entries) {
  console.log(`  ${String(width).padStart(3)} x ${String(width).padEnd(3)} ${kb(length).padStart(8)}  from ${width <= SMALL_MAX ? 'icon-small.svg' : 'icon.svg'}`);
}
for (const [name, buf] of outputs.filter(([name]) => name !== 'icon.ico')) {
  const { width, height } = pngSize(buf);
  const from = name === 'icon.png' ? 'icon.svg' : 'icon-small.svg';
  console.log(`${name.padEnd(12)} ${width} x ${height} ${kb(buf.length).padStart(8)}  from ${from}`);
}
if (pngDir) console.log(`every size written to ${pngDir}`);
