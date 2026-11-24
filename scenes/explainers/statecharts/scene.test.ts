import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Statecharts from './scene.ts';
import { Resvg } from '@resvg/resvg-js';
import { Text, toSvgString } from '../../../src/index.ts';
import type { Box, Scene } from '../../../src/index.ts';
import type { Sink } from '../../../src/index.ts';
import type { View } from '../../../explain/index.ts';
import { TYPE } from '../../../explain/drawing.ts';
import { loadFonts } from '../../../explain/testing.ts';
import { coffee, coffeeWithFrother, activeStates } from './model.ts';

await loadFonts();
const oracle = JSON.parse(readFileSync(new URL('./fixtures/statecharts-xstate.json', import.meta.url), 'utf8')) as {
  charts: Record<string, { configurations: string[][] }>;
};

test('every oracle coffee and frother configuration fits the whole phone picture at the readable type floor', async () => {
  const checked: number[] = [];
  const sink: Sink = {
    skipUntil: Infinity,
    async frame() {},
    async stepEnd(scene, step) {
      if (step.name !== 'parent' && step.name !== 'frother') return;
      const chart = step.name === 'parent' ? coffee() : coffeeWithFrother();
      const configurations = oracle.charts[step.name === 'parent' ? 'coffee' : 'coffeeWithFrother']!.configurations;
      const pictures = scene.mobjects.filter((m): m is View => 'draw' in m && typeof m.draw === 'function');
      assert.equal(pictures.length, 1);
      const picture = pictures[0]!;
      for (const config of configurations) {
        const drawn = picture.draw({ config, current: activeStates(chart, config) }, scene.shown);
        const labels = drawn.family().filter(m => m instanceof Text);
        assert.ok(labels.length > 0);
        for (const label of labels) {
          assert.ok(label.textSize() >= TYPE.small - 1e-6, label.text);
          const box = label.box()!;
          assert.ok(box[0] >= -8 && box[1] >= -4.5 && box[2] <= 8 && box[3] <= 4.5, label.text);
        }
      }
      checked.push(configurations.length);
    },
  };
  await new Statecharts(sink).run();
  assert.deepEqual(checked, [5, 9]);
});

function overlapArea(a: Box, b: Box): number {
  return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
}

function glyphInk(scene: Scene, word: Text): number[] {
  const pixels = () => new Resvg(toSvgString(scene, { width: 800 }), { font: { loadSystemFonts: false } }).render().pixels;
  const withGlyph = pixels();
  return word.children.map(glyph => {
    const opacity = glyph.style.opacity;
    try {
      glyph.setStyle({ opacity: 0 }, false);
      const absent = pixels();
      let changed = 0;
      for (let i = 0; i < absent.length; i += 4) {
        if (Math.abs(withGlyph[i]! - absent[i]!) > 8 || Math.abs(withGlyph[i + 1]! - absent[i + 1]!) > 8 ||
          Math.abs(withGlyph[i + 2]! - absent[i + 2]!) > 8) changed++;
      }
      return changed;
    } finally {
      glyph.setStyle({ opacity }, false);
    }
  });
}

test('the regions morph keeps unmuted over its destination plate and the frother moves past off without overwriting it', async () => {
  let crossedCell = false;
  let firstOffX: number | undefined, lastOffX: number | undefined;
  await new Statecharts({
    async frame(scene) {
      const step = scene.currentStep?.name;
      if (step !== 'regions' && step !== 'frother') return;
      const family = scene.familyMembers();
      const painted = (m: Text) => m.children.length === m.text.length && m.children.every(g => g.style.opacity >= 0.5);
      if (step === 'frother') {
        const words = family.filter((m): m is Text => m instanceof Text && painted(m));
        const still = words.find(m => m.text === 'still');
        if (!still) return;
        for (const off of words.filter(m => m.text === 'off')) {
          lastOffX = off.box()![0];
          firstOffX ??= lastOffX;
          assert.equal(overlapArea(off.box()!, still.box()!), 0, 'the two readable state names overlap during the reflow');
        }
        return;
      }
      if (crossedCell) return;
      const text = family.find((m): m is Text => m instanceof Text && m.key === 'r:word:0,0:1' && m.text === 'unmuted' && painted(m));
      const plate = family.find(m => m.key === 'r:cell:0,1' && m.style.opacity >= 0.95);
      if (!text || !plate) return;
      const word = text.box()!;
      if (overlapArea(word, plate.box()!) < 0.95 * (word[2] - word[0]) * (word[3] - word[1])) return;

      // Make a reference with only the word moved to the front. Its background, colour,
      // and coordinates stay the same even when the destination cell crosses behind it.
      const parent = text.parent!;
      const index = parent.children.indexOf(text);
      const actual = glyphInk(scene, text);
      try {
        parent.add(text);
        const front = glyphInk(scene, text);
        assert.equal(front.length, 'unmuted'.length);
        front.forEach((ink, i) => {
          assert.ok(ink > 0, `reference glyph ${i} paints ink`);
          assert.ok(actual[i]! >= 0.9 * ink, `the destination cell hides glyph ${i} of unmuted (${actual[i]}/${ink} pixels)`);
        });
      } finally {
        parent.insert(index, text);
      }
      crossedCell = true;
    },
  }).run();
  assert.ok(crossedCell, 'the matched word reached the destination cell');
  assert.ok(firstOffX !== undefined && lastOffX !== undefined && lastOffX - firstOffX > 1,
    'off was readable with still at both its old position and its new position');
});
