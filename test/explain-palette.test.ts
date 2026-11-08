import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletteOf, palettePng } from '../tools/lib/explain-palette.ts';
import { cardPicture, cardPng } from '../tools/lib/explain-shots.ts';
import { rasterize } from '../tools/lib/explain-raster.ts';
import { collectProject, defaultScenario } from '../tools/lib/explain-project.ts';

/** A PNG's pixels as resvg decodes it, drawn 1:1. */
async function decode(png: Buffer, width: number, height: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>`;
  return (await rasterize(svg)).pixels;
}
const worst = (a: Uint8Array, b: Uint8Array) => {
  let most = 0;
  for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs(a[i]! - b[i]!));
  return most;
};
const colours = (rgba: Uint8Array) => {
  const seen = new Set<number>();
  for (let i = 0; i < rgba.length; i += 4) seen.add((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!);
  return seen.size;
};

// wcag-map's `open` step: the step picture with the largest error of all 175 (see BOUND).
const project = await collectProject('scenes/explainers/wcag-map', { write: false }),
  scenario = defaultScenario(project),
  step = scenario.trace.steps.find((s) => s.step === 'open')!,
  picture = await cardPicture(scenario.Scene, step.frame1!);

// Over all 175 step pictures, no channel of any pixel moved more than 11 levels (of 255); most
// moved 2 or fewer. 16 leaves room for a scene change without letting a real regression through:
// PIL's median cut on the same pictures moved pixels by up to 40, and JPEG at quality 85 by 68.
const BOUND = 16;

test('a step picture as a palette PNG: the same bytes every time, under 60% of the full-colour PNG, every pixel within 16 levels', async () => {
  assert.ok(colours(picture.pixels) > 256, 'the picture needs more than 256 colours, or nothing is quantised');
  const png = palettePng(picture.pixels, picture.width, picture.height);
  assert.deepEqual(palettePng(Buffer.from(picture.pixels), picture.width, picture.height), png, 'deterministic');
  const full = picture.asPng();
  assert.ok(png.length < full.length * 0.6, `${png.length} bytes against ${full.length}`);
  // resvg decodes the full-colour PNG exactly, so the decoder is not where any error comes from.
  assert.equal(worst(await decode(full, picture.width, picture.height), picture.pixels), 0);
  const back = await decode(png, picture.width, picture.height);
  assert.ok(colours(back) <= 256);
  const error = worst(back, picture.pixels);
  assert.ok(error > 0 && error <= BOUND, `worst channel error ${error}`);
  console.log(`wcag-map/open: ${png.length} bytes against ${full.length}, worst channel error ${error}`);
});

test('demos:build writes the step pictures as palette PNGs', async () => {
  const png = await cardPng(scenario.Scene, step.frame1!);
  assert.equal(png[25], 3, 'PNG colour type 3: palette');
  assert.deepEqual(png, palettePng(picture.pixels, picture.width, picture.height));
});

test('a picture of 256 colours or fewer keeps every pixel exactly', async () => {
  const width = 40,
    height = 20,
    rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([i % 256, (i * 7) % 256, 90, 255], i * 4);
  assert.equal(colours(rgba), 256);
  const { palette } = paletteOf(rgba);
  assert.equal(palette.length, 256);
  assert.equal(worst(await decode(palettePng(rgba, width, height), width, height), rgba), 0);
});

test('palettePng takes opaque RGBA of the stated size only', () => {
  assert.throws(() => palettePng(new Uint8Array([1, 2, 3, 128]), 1, 1), /opaque/);
  assert.throws(() => palettePng(new Uint8Array(8), 1, 1), /not 1 × 1 RGBA/);
});
