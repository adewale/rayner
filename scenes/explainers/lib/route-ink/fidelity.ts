import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { Text, toSvgString } from '../../../../src/index.ts';
import type { Box, Mobject, Scene } from '../../../../src/index.ts';

/** Native SVG knockout for a moving object's effect on the actual strokes of nearby words. */
const pixels = (scene: Scene) =>
  new Resvg(toSvgString(scene, { width: 800 }), { font: { loadSystemFonts: false } }).render().pixels;

function without<T>(objects: readonly Mobject[], read: () => T): T {
  const members = [...new Set(objects.flatMap(object => object.family()))];
  const opacities = members.map(object => object.style.opacity);
  try {
    members.forEach(object => object.setStyle({ opacity: 0 }, false));
    return read();
  } finally {
    members.forEach((object, index) => object.setStyle({ opacity: opacities[index]! }, false));
  }
}

function delta(a: Uint8Array, b: Uint8Array, i: number): number {
  return Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
}

/** A generous stroke allowance discards distant pairs only. A near pair is decided by painting it. */
function near(a: Box, b: Box): boolean {
  return a[0] <= b[2] + 0.15 && b[0] <= a[2] + 0.15 && a[1] <= b[3] + 0.15 && b[1] <= a[3] + 0.15;
}

export function routeInkCheck() {
  const visiblePositions = new Set<string>();
  const subjects = new Set<string>(), paintedSubjects = new Set<string>();
  let restored = 0, worst = '';
  return {
    frame(scene: Scene, moverKey: string, protectedWords: readonly Text[]) {
      let picture: Uint8Array | undefined;
      const actualPixels = () => picture ??= pixels(scene);
      for (const word of protectedWords) {
        subjects.add(word.text);
        if (paintedSubjects.has(word.text) || !word.children.some(glyph => glyph.style.opacity > 0.05)) continue;
        const actual = actualPixels(), absent = without([word], () => pixels(scene));
        for (let i = 0; i < actual.length; i += 4) if (delta(actual, absent, i) > 16) {
          paintedSubjects.add(word.text);
          break;
        }
      }
      const movers = scene.familyMembers().filter(object => object.key === moverKey);
      for (const mover of movers) {
        const box = mover.box();
        if (!box || !protectedWords.length) continue;
        const adjacent = protectedWords.filter(word => { const b = word.box(); return b && near(box, b); });
        const [x, y] = mover.center(), position = [x!.toFixed(1), y!.toFixed(1)].join(',');
        // Establish visible ink at two different positions even when the repaired route is far
        // from all words. A missing/transparent traveller or target must not pass vacuously.
        const witness = visiblePositions.size < 2 && !visiblePositions.has(position);
        if (!adjacent.length && !witness) continue;
        const words = adjacent.length ? adjacent : protectedWords;
        const actual = actualPixels();
        const minusWords = without(words, () => pixels(scene));
        const [exposed, bare] = without([mover], () => [pixels(scene), without(words, () => pixels(scene))] as const);
        let travellerInk = 0, wordInk = 0, loss = 0;
        for (let i = 0; i < actual.length; i += 4) {
          if (delta(actual, exposed, i) > 8) travellerInk++;
          const open = delta(exposed, bare, i);
          if (open <= 16) continue;
          wordInk++;
          if (delta(actual, minusWords, i) <= 0.15 * open) loss++;
        }
        if (wordInk > 0 && travellerInk > 0) visiblePositions.add(position);
        if (loss > restored) {
          restored = loss;
          worst = `${scene.currentStep?.path}, frame ${scene.frameCount}, ${words.map(w => w.text).join(' / ')}`;
        }
      }
    },
    assertClear(label: string, requiredWords: readonly string[]) {
      assert.equal(restored, 0, `${label} hides ${restored} painted text pixels at ${worst}`);
      assert.ok(visiblePositions.size >= 2, `${label} must paint the traveller in two positions beside actual lettering`);
      for (const word of [...requiredWords, ...subjects]) {
        assert.ok(paintedSubjects.has(word), `${label} has no painted witness for "${word}"`);
      }
    },
  };
}
