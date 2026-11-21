import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { Text, VMobject, toSvgString } from '../../../../src/index.ts';
import type { Box, Mobject, Scene, Vec } from '../../../../src/index.ts';

/** Native SVG knockout for a moving object's effect on the paint of nearby words and drawings. */
const width = 800, height = 450;
const pixels = (scene: Scene) =>
  new Resvg(toSvgString(scene, { width }), { font: { loadSystemFonts: false } }).render().pixels;

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

/** Bound every descendant's stroke, including acute miters and square caps. Coordinate and
 * stroke-width rounding can add one SVG user unit (1/1000 scene units), then antialiasing can
 * reach the next output pixel. Only the native knockout decides whether a remaining pair touches. */
function paintBounds(part: Mobject, pixel: number): Box | null {
  const box = part.box();
  if (!box) return null;
  let stroke = 0;
  for (const member of part.family()) {
    const style = member.style;
    if (!(member instanceof VMobject) || style.stroke === 'none' || style.strokeOpacity <= 0 || style.strokeWidth <= 0) continue;
    const join = style.lineJoin === 'miter' ? Math.max(1, style.miterLimit ?? 4) : 1;
    stroke = Math.max(stroke, (style.strokeWidth + 0.001) * join);
  }
  const reach = stroke + 0.001 + pixel;
  return [box[0] - reach, box[1] - reach, box[2] + reach, box[3] + reach];
}

export function routeInkCheck() {
  const witnesses = new WeakMap<Mobject, {world: Vec; screen: Vec; worldMoved: boolean; screenMoved: boolean}>();
  const subjects = new Set<string>(), paintedSubjects = new Set<string>();
  let sawTravel = false, restored = 0, worst = '', material = 'text';
  return {
    frame(scene: Scene, moverKey: string, protectedParts: readonly Mobject[]) {
      const camera = scene.frame.box()!;
      const pixel = Math.max((camera[2] - camera[0]) / width, (camera[3] - camera[1]) / height);
      let picture: Uint8Array | undefined;
      const actualPixels = () => picture ??= pixels(scene);
      for (const part of protectedParts) {
        const name = part instanceof Text ? part.text : part.key;
        assert.ok(name, 'a protected drawing needs a key or text');
        subjects.add(name);
        if (paintedSubjects.has(name) || !part.family().some(member => member.style.opacity > 0.05)) continue;
        const actual = actualPixels(), absent = without([part], () => pixels(scene));
        for (let i = 0; i < actual.length; i += 4) if (delta(actual, absent, i) > 16) {
          paintedSubjects.add(name);
          break;
        }
      }
      const movers = scene.familyMembers().filter(object => object.key === moverKey);
      for (const mover of movers) {
        const box = paintBounds(mover, pixel);
        if (!box || !protectedParts.length) continue;
        const adjacent = protectedParts.filter(part => {
          const b = paintBounds(part, pixel);
          return b && box[0] <= b[2] && b[0] <= box[2] && box[1] <= b[3] && b[1] <= box[3];
        });
        if (!adjacent.length && sawTravel) continue;
        const words = adjacent.length ? adjacent : protectedParts;
        const actual = actualPixels();
        const minusSubjects = without(words, () => pixels(scene));
        const [exposed, bare] = without([mover], () => [pixels(scene), without(words, () => pixels(scene))] as const);
        let weight = 0, x = 0, y = 0, subjectInk = 0, loss = 0;
        for (let i = 0; i < actual.length; i += 4) {
          if (!sawTravel) {
            const ink = delta(actual, exposed, i);
            if (ink > 8) {
              weight += ink;
              x += ink * ((i / 4) % width);
              y += ink * Math.floor(i / 4 / width);
            }
          }
          const open = delta(exposed, bare, i);
          if (open <= 16) continue;
          subjectInk++;
          if (delta(actual, minusSubjects, i) <= 0.15 * open) loss++;
        }
        // Geometry can cross a fixed opening while the same small patch keeps painting there.
        // Witness this particular traveller at two positions in the final composited picture.
        if (subjectInk > 0 && weight > 0) {
          const screen: Vec = [x / weight, y / weight];
          const world = mover.center(), first = witnesses.get(mover);
          if (!first) witnesses.set(mover, {world, screen, worldMoved: false, screenMoved: false});
          else {
            first.worldMoved ||= world[0] !== first.world[0] || world[1] !== first.world[1];
            first.screenMoved ||= screen[0] !== first.screen[0] || screen[1] !== first.screen[1];
            sawTravel = first.worldMoved && first.screenMoved;
          }
        }
        if (loss > restored) {
          restored = loss;
          material = words.every(m => m instanceof Text) ? 'text' : 'drawing';
          worst = `${scene.currentStep?.path}, frame ${scene.frameCount}, ${words.map(m => m instanceof Text ? m.text : m.key).join(' / ')}`;
        }
      }
    },
    assertClear(label: string, requiredSubjects: readonly string[]) {
      assert.equal(restored, 0, `${label} hides ${restored} painted ${material} pixels at ${worst}`);
      assert.ok(sawTravel, `${label} must paint the traveller at two distinct screen positions beside the protected drawings`);
      for (const word of [...requiredSubjects, ...subjects]) {
        assert.ok(paintedSubjects.has(word), `${label} has no painted witness for "${word}"`);
      }
    },
  };
}
