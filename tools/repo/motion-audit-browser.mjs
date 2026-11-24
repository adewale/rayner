import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const { values } = parseArgs({ options: { input: { type: 'string' }, frames: { type: 'string' }, out: { type: 'string' }, phone: { type: 'boolean' } } });
assert.ok(values.input && values.frames && values.out, 'use --input <svg-directory> --frames 0,15,30-35 --out <png-directory>');
const input = resolve(values.input), output = resolve(values.out);
const files = new Map();
for (const name of await readdir(input)) {
  const match = /^(\d+)\.svg(?:\.gz)?$/.exec(name);
  if (!match) continue;
  const n = Number(match[1]);
  assert.ok(!files.has(n), `ambiguous source frame ${n}`);
  files.set(n, name);
}
const selected = new Set();
for (const term of values.frames.split(',')) {
  const match = /^(\d+)(?:-(\d+))?$/.exec(term);
  assert.ok(match, `invalid frame selection ${term}`);
  const a = Number(match[1]), b = match[2] ? Number(match[2]) : a;
  assert.ok(Number.isSafeInteger(a) && Number.isSafeInteger(b) && b >= a && b - a < 500, 'select at most 500 finite frame numbers');
  for (let n = a; n <= b; n++) selected.add(n);
}
assert.ok(selected.size > 0 && selected.size <= 500, 'select 1..500 frames');
const frames = [...selected].sort((a, b) => a - b);
for (const n of frames) assert.ok(files.has(n), `source frame ${n} is missing`);
const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('playwright-core/package.json'));
const pin = JSON.parse(await readFile(join(packageRoot, 'browsers.json'), 'utf8')).browsers.find(b => b.name === 'chromium-headless-shell');
assert.ok(pin?.revision && pin?.browserVersion, 'Playwright must pin a headless Chromium revision');
const binary = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/tmp/rayner-pinned', `chromium_headless_shell-${pin.revision}`, 'chrome-headless-shell-linux64/chrome-headless-shell');
assert.ok((await stat(binary)).isFile(), `pinned browser unavailable: ${binary}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: binary, headless: true });
try {
  assert.equal(browser.version(), pin.browserVersion, 'the selected binary must match the pinned browser version exactly');
  const width = values.phone ? 358 : 800, height = width * 450 / 800;
  const page = await browser.newPage({ viewport: { width, height: Math.ceil(height) }, deviceScaleFactor: 1 });
  const receipt = { status: 'incomplete', renderer: 'Chromium native SVG document', binary, version: browser.version(), revision: pin.revision,
    input, output, presentation: values.phone ? '358px whole-picture phone' : 'native800x450', deviceScaleFactor: 1,
    displayViewport: { width, height }, pngDimensions: { width, height: Math.ceil(height) }, expected: frames.length, completed: 0, frames: [] };
  const save = async () => { await writeFile(join(output, 'receipt.json.tmp'), JSON.stringify(receipt, null, 2) + '\n'); await rename(join(output, 'receipt.json.tmp'), join(output, 'receipt.json')); };
  await save();
  for (const frame of frames) {
    const source = join(input, files.get(frame));
    const bytes = await readFile(source);
    const svg = source.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
    await page.goto('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
    const sourceDimensions = await page.locator('svg').evaluate(svg => {
      const box = svg.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    assert.deepEqual(sourceDimensions, { x: 0, y: 0, width: 800, height: 450 }, 'source must start at native800x450');
    if (values.phone) await page.locator('svg').evaluate((svg, size) => {
      // Change only the outer viewport. Keep source geometry, viewBox and styles intact.
      svg.setAttribute('width', String(size.width)); svg.setAttribute('height', String(size.height));
    }, { width, height });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const dimensions = await page.locator('svg').evaluate(svg => {
      const box = svg.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    assert.deepEqual(dimensions, { x: 0, y: 0, width, height }, 'source must paint at the declared display scale');
    const png = join(output, String(frame).padStart(4, '0') + '.png');
    // Include the fractional bottom row rather than cropping it; any excess is transparent.
    await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width, height: Math.ceil(height) } });
    receipt.frames.push({ frame, source, svgSha256: createHash('sha256').update(svg).digest('hex'), sourceDimensions,
      presentationScale: width / 800, png, ...dimensions });
    receipt.completed++;
    await save();
  }
  receipt.status = 'complete';
  await save();
  console.log(JSON.stringify({ receipt: join(output, 'receipt.json'), version: receipt.version, frames: receipt.completed }));
} finally { await browser.close(); }
