import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { Text, VMobject, toSvgString } from '../../../../src/index.ts';
import type { Box, Mobject, Scene, Vec } from '../../../../src/index.ts';
import {mobjectId, renderElements, serializeElement} from '../../../../src/internal.ts';

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

/** Independent native matte: contrast two diagnostic paints with the same clips and layers. */
function visibleSupport(scene: Scene, mover: Mobject): Uint8Array {
  const family = mover.family(), paint = family.map(m => ({fill: m.style.fill, stroke: m.style.stroke}));
  try {
    const tint = (color: string) => {
      family.forEach((m, i) => m.setStyle({fill: paint[i]!.fill === 'none' ? 'none' : color, stroke: paint[i]!.stroke === 'none' ? 'none' : color}, false));
      return pixels(scene);
    };
    const black = tint('#000'), white = tint('#fff'), support = new Uint8Array(width * height);
    for (let i = 0; i < black.length; i += 4) support[i / 4] = delta(black, white, i);
    return support;
  } finally { family.forEach((m, i) => m.setStyle(paint[i]!, false)); }
}

function foreground(scene: Scene, mover: Mobject): {svg: string; bounds: Box | null}[] {
  const ids = new Set(mover.family().map(mobjectId)), members = new Map(scene.familyMembers().map(m => [mobjectId(m), m]));
  const camera = scene.frame.box()!, unit = (camera[2] - camera[0]) / width;
  let passed = false;
  return renderElements(scene).flatMap(record => {
    if (ids.has(record.id)) { passed = true; return []; }
    if (!passed) return [];
    const member = members.get(record.id), bounds = member ? paintBounds(member, unit) : null;
    return [{svg: serializeElement(record), bounds: bounds && [(bounds[0] - camera[0]) / unit, (camera[3] - bounds[3]) / unit,
      (bounds[2] - camera[0]) / unit, (camera[3] - bounds[1]) / unit] as Box}];
  });
}

function stableForeground(before: ReturnType<typeof foreground>, after: ReturnType<typeof foreground>, a: Uint8Array, b: Uint8Array): boolean {
  for (const [old, next] of [[before, after], [after, before]] as const) {
    const retained = new Set(next.map(m => m.svg));
    for (const mark of old) if (!retained.has(mark.svg)) {
      const box = mark.bounds ?? [0, 0, width, height];
      for (let y = Math.max(0, Math.floor(box[1]!)); y < Math.min(height, Math.ceil(box[3]!)); y++)
        for (let x = Math.max(0, Math.floor(box[0]!)); x < Math.min(width, Math.ceil(box[2]!)); x++)
          if (a[y * width + x] || b[y * width + x]) return false;
    }
  }
  return true;
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
    const miter = Number.isFinite(style.miterLimit) ? Math.max(4, style.miterLimit!) : 4;
    const lineJoin = style.lineJoin ?? 'round';
    const join = lineJoin === 'round' || lineJoin === 'bevel' ? 1 : miter;
    stroke = Math.max(stroke, (style.strokeWidth + 0.001) * join);
  }
  const reach = stroke + 0.001 + pixel;
  return [box[0] - reach, box[1] - reach, box[2] + reach, box[3] + reach];
}

export function routeInkCheck() {
  type Witness = {key: string; proved: boolean; first?: {world: Vec; screen: Vec; actual: Uint8Array; support: Uint8Array; foreground: ReturnType<typeof foreground>}};
  const active = new Map<Mobject, Witness>(), witnesses: Witness[] = [];
  const subjects = new Set<string>(), paintedSubjects = new Set<string>();
  let restored = 0, worst = '', material = 'text';
  const assertUnobstructed = (label: string): void => {
    assert.equal(restored, 0, `${label} hides ${restored} painted ${material} pixels at ${worst}`);
  };
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
      const present = new Set(movers);
      for (const [mover, witness] of active) if (witness.key === moverKey && !present.has(mover)) active.delete(mover);
      for (const mover of movers) {
        let witness = active.get(mover);
        if (!witness) { witness = {key: moverKey, proved: false}; active.set(mover, witness); witnesses.push(witness); }
        const box = paintBounds(mover, pixel);
        if (!box || !protectedParts.length) continue;
        const adjacent = protectedParts.filter(part => {
          const b = paintBounds(part, pixel);
          return b && box[0] <= b[2] && b[0] <= box[2] && box[1] <= b[3] && b[1] <= box[3];
        });
        if (!adjacent.length && witness.proved) continue;
        const words = adjacent.length ? adjacent : protectedParts;
        const actual = actualPixels();
        const minusSubjects = without(words, () => pixels(scene));
        const [exposed, bare] = without([mover], () => [pixels(scene), without(words, () => pixels(scene))] as const);
        let contribution = false, subjectInk = 0, loss = 0;
        for (let i = 0; i < actual.length; i += 4) {
          contribution ||= delta(actual, exposed, i) > 8;
          const open = delta(exposed, bare, i);
          if (open <= 16) continue;
          subjectInk++;
          if (delta(actual, minusSubjects, i) <= 0.15 * open) loss++;
        }
        // Geometry can cross a fixed opening while the same small patch keeps painting there.
        // Witness this particular traveller at two positions in the final composited picture.
        if (!witness.proved && subjectInk > 0 && contribution) {
          const support = visibleSupport(scene, mover);
          let weight = 0, x = 0, y = 0;
          for (let p = 0; p < support.length; p++) {
            const ink = support[p]!;
            weight += ink; x += ink * (p % width); y += ink * Math.floor(p / width);
          }
          if (!weight) continue;
          const screen: Vec = [x / weight, y / weight];
          const world = mover.center(), first = witness.first, above = foreground(scene, mover);
          if (!first) witness.first = {world, screen, actual, support, foreground: above};
          else {
            const moved = (world[0] !== first.world[0] || world[1] !== first.world[1]) &&
              (screen[0] !== first.screen[0] || screen[1] !== first.screen[1]);
            witness.proved = moved && stableForeground(first.foreground, above, first.support, support) &&
              support.some((ink, p) => ink !== first.support[p] && delta(actual, first.actual, 4 * p) > 0);
            if (witness.proved) delete witness.first;
            else witness.first = {world, screen, actual, support, foreground: above};
          }
        }
        if (loss > restored) {
          restored = loss;
          material = words.every(m => m instanceof Text) ? 'text' : 'drawing';
          worst = `${scene.currentStep?.path}, frame ${scene.frameCount}, ${words.map(m => m instanceof Text ? m.text : m.key).join(' / ')}`;
        }
      }
    },
    /** Incremental damage assertion; final movement and subject completeness belong to assertClear. */
    assertUnobstructed,
    assertClear(label: string, requiredSubjects: readonly string[]) {
      assertUnobstructed(label);
      assert.ok(witnesses.length, `${label} has no traveller occurrence`);
      for (const [i, witness] of witnesses.entries()) assert.ok(witness.proved,
        `${label}, ${witness.key} occurrence ${i + 1}, must paint the traveller at two distinct screen positions beside the protected drawings`);
      for (const word of [...requiredSubjects, ...subjects]) {
        assert.ok(paintedSubjects.has(word), `${label} has no painted witness for "${word}"`);
      }
    },
  };
}
