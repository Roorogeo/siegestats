// Screenshot of the renderer in a browser (in-page bridge), for visual checks while developing.
//
//   npm run build:web                       (or: npx vite build --config vite.web.config.ts --outDir /abs/dir)
//   node scripts/screenshot.mjs --out shot.png [--dist dist-web] [--route /settings/themes] [--theme ember]
//        [--width 1280] [--height 800] [--scheme dark|light] [--settings '{"theme":{...}}'] [--full] [--click "text=Neon"]
//
// --theme sets the active theme before the app loads; --settings merges raw JSON into the stored settings;
// --click runs one or more Playwright clicks (repeat the flag) before the screenshot; --wait <ms> pauses first.
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const multi = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const opt = (name, fallback) => multi(name).at(-1) ?? fallback;
const flag = (name) => args.includes(`--${name}`);

const dist = path.resolve(opt('dist', 'dist-web'));
const out = path.resolve(opt('out', 'screenshot.png'));
const route = opt('route', '/');
const width = Number(opt('width', 1280));
const height = Number(opt('height', 800));
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`No build at ${dist}. Run: npm run build:web`);
  process.exit(2);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path.join(dist, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(opt('scale', 1)), colorScheme: opt('scheme', 'dark') });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  const settings = JSON.parse(opt('settings', '{}'));
  const theme = opt('theme', null);
  if (theme) settings.theme = { ...(settings.theme ?? {}), activeThemeId: theme };
  if (Object.keys(settings).length) {
    await page.addInitScript((json) => window.localStorage.setItem('sightline.settings', json), JSON.stringify(settings));
  }

  await page.goto(`${base}/#${route}`);
  await page.waitForSelector('#root > *');
  for (const selector of multi('click')) await page.click(selector);
  await page.waitForTimeout(Number(opt('wait', 150)));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: flag('full') });
  console.log(JSON.stringify({ out, route, theme: await page.evaluate(() => document.documentElement.dataset.theme), errors }));
} finally {
  await browser.close();
  server.close();
}
