// node tools/repo/motion-occlusion-proof.ts [--chromium] [--out <directory>]
// Replay the credited poll mutation and its unedited chapter. Determine what the
// named glyphs actually paint by removing each one from the composited SVG.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from '../../explain/testing.ts';
import { Text, toSvgString, type Scene } from '../../src/index.ts';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { collectProject } from '../lib/explain-project.ts';
import { ROOT } from '../lib/roots.ts';
import { buildVariant, type Variant } from './motion-corpus-lib.ts';

const name = 'Example Company', glyphCount = [...name].filter(c => c !== ' ').length;
const offsets = [27 / 30, 29 / 30, 30 / 30]; // 0.900, 0.967 and 1.000 s into collect.
const width = 800;
const raster = (svg: string) => new Resvg(svg, { font: { loadSystemFonts: false } }).render();
// The first SVG is the composite. Each following SVG has exactly one glyph removed.
interface BrowserFrames { drawn: string[]; withoutPoll: string[] }
const { values } = parseArgs({ options: { out: { type: 'string' }, chromium: { type: 'boolean' } } });

/** Pixels for which removing one glyph changes at least one colour channel by more than eight levels. */
function contribution(drawn: Uint8Array, removed: Uint8Array): number {
  assert.equal(removed.length, drawn.length);
  let n = 0;
  for (let i = 0; i < drawn.length; i += 4) {
    if (Math.max(Math.abs(drawn[i]! - removed[i]!), Math.abs(drawn[i + 1]! - removed[i + 1]!),
      Math.abs(drawn[i + 2]! - removed[i + 2]!)) > 8) n++;
  }
  return n;
}

function glyphPixels(scene: Scene, word: Text, composite: Uint8Array, svgs?: string[]): number[] {
  return word.children.map(glyph => {
    const opacity = glyph.style.opacity;
    try {
      glyph.setOpacity(0);
      const svg = toSvgString(scene, { width });
      svgs?.push(svg);
      return contribution(composite, raster(svg).pixels);
    } finally { glyph.setOpacity(opacity); }
  });
}

function measure(scene: Scene, browser?: BrowserFrames) {
  const family = scene.familyMembers();
  const cards = family.filter(m => m.key === 'card'), polls = family.filter(m => m.key === 'poll');
  assert.equal(cards.length, 1, 'exactly one device card');
  assert.equal(polls.length, 1, 'exactly one collect poll');
  const words = cards[0]!.family().filter((m): m is Text => m instanceof Text && m.text === name);
  assert.equal(words.length, 1, 'the company name belongs to this card');
  const word = words[0]!, poll = polls[0]!;
  assert.equal(word.children.length, glyphCount, 'one glyph per non-space character in this company name');
  const svg = toSvgString(scene, { width }), image = raster(svg);
  browser?.drawn.push(svg);
  const drawn = glyphPixels(scene, word, image.pixels, browser?.drawn);
  const opacities = poll.family().map(m => ({ m, opacity: m.style.opacity }));
  let withoutPoll: number[];
  try {
    poll.setOpacity(0);
    const svg = toSvgString(scene, { width });
    browser?.withoutPoll.push(svg);
    withoutPoll = glyphPixels(scene, word, raster(svg).pixels, browser?.withoutPoll);
  } finally {
    for (const { m, opacity } of opacities) m.setStyle({ opacity }, false);
  }
  return { drawn, withoutPoll, image };
}

interface Observation { seconds: number; sinceCollect: number; drawn: number[]; withoutPoll: number[] }

function verifyPixels(drawn: number[], withoutPoll: number[], fixed: boolean) {
  assert.equal(drawn.length, glyphCount);
  assert.equal(withoutPoll.length, glyphCount);
  assert.ok(withoutPoll.every(n => n > 0), 'removing the poll exposes ink from every glyph');
  if (fixed) assert.deepEqual(drawn, withoutPoll, 'the fixed route leaves every glyph unchanged');
  else {
    assert.ok(drawn.includes(0), 'the poll completely hides a glyph');
    assert.ok(drawn.filter((n, i) => n <= 0.1 * withoutPoll[i]!).length >= 2, 'the poll removes at least 90% of two glyphs');
  }
}

async function capture(variant: Variant, fixed: boolean) {
  const id = `proof-poll-${randomUUID()}`;
  const observations: Observation[] = [];
  let png: Buffer | undefined;
  const browser: BrowserFrames | undefined = values.chromium ? { drawn: [], withoutPoll: [] } : undefined;
  try {
    const project = await collectProject(await buildVariant({ ...variant, id }), { write: false });
    const scenarios = project.scenarios.filter(s => s.values.flow === 'device');
    assert.equal(scenarios.length, 1, 'exactly one device flow');
    const device = scenarios[0]!;
    let cursor = 0, previous = 0, origin: number | undefined, events = 0;
    await new device.Scene({ async frame(scene) {
      const ask = scene.currentStep?.path === 'ask';
      for (; cursor < scene.evidence.length; cursor++) {
        const event = scene.evidence[cursor]!;
        if (ask && event.kind === 'event' && event.event === 'collect') { events++; origin = previous; }
      }
      previous = scene.time;
      if (!ask || origin === undefined) return;
      const sinceCollect = scene.time - origin;
      const offset = offsets.find(t => Math.abs(sinceCollect - t) < 1e-6);
      if (offset === undefined) return;
      const { drawn, withoutPoll, image } = measure(scene, offset === offsets[1] ? browser : undefined);
      verifyPixels(drawn, withoutPoll, fixed);
      if (offset === offsets[1]) png = image.asPng();
      observations.push({ seconds: scene.time, sinceCollect: offset, drawn, withoutPoll });
    } }).run();
    assert.equal(events, 1, 'exactly one collect during the ask step');
    assert.deepEqual(observations.map(f => f.sinceCollect), offsets);
    assert.ok(png, 'the matched middle frame was rasterized');
    return { observations, png, browser };
  } finally {
    await rm(join(ROOT, 'out', `motion-corpus-${id}`), { recursive: true, force: true });
  }
}

/** Paint the same letter-removal controls in Chromium's native SVG image and canvas. */
async function chromiumProof(fixed: BrowserFrames, mutation: BrowserFrames) {
  const { launch } = await import('../lib/browser.ts');
  const browser = await launch('The poll occlusion evidence');
  try {
    const page = await browser.newPage();
    const measure = (svgs: string[]) => page.evaluate(async images => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      let composite: Uint8ClampedArray | undefined;
      const counts: number[] = [];
      for (const svg of images) {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
          const image = new Image();
          image.src = url; await image.decode();
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          if (!composite) { composite = pixels; continue; }
          let n = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (Math.max(Math.abs(pixels[i]! - composite[i]!), Math.abs(pixels[i + 1]! - composite[i + 1]!),
              Math.abs(pixels[i + 2]! - composite[i + 2]!)) > 8) n++;
          }
          counts.push(n);
        } finally { URL.revokeObjectURL(url); }
      }
      return counts;
    }, svgs);
    const inspect = async (frames: BrowserFrames, correct: boolean) => {
      const drawn = await measure(frames.drawn), withoutPoll = await measure(frames.withoutPoll);
      verifyPixels(drawn, withoutPoll, correct);
      return { drawn, withoutPoll };
    };
    return { version: browser.version(), sinceCollect: offsets[1], fixed: await inspect(fixed, true), mutation: await inspect(mutation, false) };
  } finally { await browser.close(); }
}

const dir = values.out ?? join(ROOT, 'out', 'motion-occlusion-proof');
const entry = CORPUS.find(e => e.id === 'sign-in-poll-over-card');
assert.ok(entry);
await loadFonts();
const fixed = await capture({ ...entry, edits: [] }, true);
const mutation = await capture(entry, false);
const chromium = fixed.browser && mutation.browser ? await chromiumProof(fixed.browser, mutation.browser) : undefined;
await mkdir(dir, { recursive: true });
await Promise.all([
  writeFile(join(dir, 'fixed.png'), fixed.png),
  writeFile(join(dir, 'mutation.png'), mutation.png),
  writeFile(join(dir, 'report.json'), JSON.stringify({
    entry: entry.id, scenario: { flow: 'device' }, step: 'ask', event: 'collect', part: 'card', label: name, foreground: 'poll',
    width, imageSinceCollect: offsets[1], fixed: fixed.observations, mutation: mutation.observations, chromium,
  }, null, 2) + '\n'),
]);
console.log(`Verified ${offsets.length} Resvg frames on each route${chromium ? ` and the middle frame in Chromium ${chromium.version}` : ''}. Evidence in ${dir}`);
