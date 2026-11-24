import assert from 'node:assert/strict';
import { renderAsync } from '@resvg/resvg-js';
import { Text, VMobject, toSvgString } from '../../../../src/index.ts';
import type { Box, Mobject, Scene, Vec } from '../../../../src/index.ts';

/** Native SVG knockout for a moving object's effect on the paint of nearby words and drawings. */
const width = 800, height = 450;
const picture = (scene: Scene) => toSvgString(scene, { width });
// The native task owns its parsed tree until completion. A synchronous Resvg instance can
// retain that tree until JS collection, whose heap limit does not account for native memory.
const pixels = async (svg: string) => (await renderAsync(svg, { font: { loadSystemFonts: false } })).pixels;

/** Only immutable SVG snapshots may escape a temporary scene mutation, never native work. */
function withoutMembers<T extends string | readonly string[]>(members: readonly Mobject[], read: () => T): T {
  const opacities = members.map(object => object.style.opacity);
  try {
    members.forEach(object => object.setStyle({ opacity: 0 }, false));
    return read();
  } finally {
    members.forEach((object, index) => object.setStyle({ opacity: opacities[index]! }, false));
  }
}

function without<T extends string | readonly string[]>(objects: readonly Mobject[], read: () => T): T {
  return withoutMembers([...new Set(objects.flatMap(object => object.family()))], read);
}

function delta(a: Uint8Array, b: Uint8Array, i: number): number {
  return Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
}

/** Independent native matte: contrast two diagnostic paints with the same clips and layers. */
async function visibleSupport(scene: Scene, mover: Mobject): Promise<Uint8Array> {
  const family = mover.family(), paint = family.map(m => ({fill: m.style.fill, stroke: m.style.stroke}));
  let blackSvg: string, whiteSvg: string;
  try {
    const tint = (color: string) => {
      family.forEach((m, i) => m.setStyle({fill: paint[i]!.fill === 'none' ? 'none' : color, stroke: paint[i]!.stroke === 'none' ? 'none' : color}, false));
      return picture(scene);
    };
    blackSvg = tint('#000'); whiteSvg = tint('#fff');
  } finally { family.forEach((m, i) => m.setStyle(paint[i]!, false)); }
  const black = await pixels(blackSvg), white = await pixels(whiteSvg), support = new Uint8Array(width * height);
  for (let i = 0; i < black.length; i += 4) support[i / 4] = delta(black, white, i);
  return support;
}

/** Public drawing order supplies the foreground; the full hierarchy keeps its clips.
 * Black and white backgrounds distinguish an opaque white aperture from empty paper. */
function foreground(scene: Scene, mover: Mobject): readonly [string, string] {
  const family = new Set(mover.family());
  let passed = false;
  const hidden = scene.familyMembers().filter(member => {
    if (member === mover) passed = true;
    return member instanceof VMobject && (!passed || family.has(member));
  });
  return withoutMembers(hidden, () => [
    toSvgString(scene, {width, background: '#000'}),
    toSvgString(scene, {width, background: '#fff'}),
  ] as const);
}

async function stableForeground(before: ReturnType<typeof foreground>, after: ReturnType<typeof foreground>, a: Uint8Array, b: Uint8Array): Promise<boolean> {
  for (const index of [0, 1] as const) {
    if (before[index] === after[index]) continue;
    const old = await pixels(before[index]), next = await pixels(after[index]);
    for (let p = 0; p < a.length; p++)
      if ((a[p] || b[p]) && delta(old, next, p * 4) > 0) return false;
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
    async frame(scene: Scene, moverKey: string, protectedParts: readonly Mobject[]): Promise<void> {
      const camera = scene.frame.box()!;
      const pixel = Math.max((camera[2] - camera[0]) / width, (camera[3] - camera[1]) / height);
      let actualPicture: Promise<Uint8Array> | undefined;
      const actualPixels = () => actualPicture ??= pixels(picture(scene));
      for (const part of protectedParts) {
        const name = part instanceof Text ? part.text : part.key;
        assert.ok(name, 'a protected drawing needs a key or text');
        subjects.add(name);
        if (paintedSubjects.has(name) || !part.family().some(member => member.style.opacity > 0.05)) continue;
        const actual = await actualPixels(), absent = await pixels(without([part], () => picture(scene)));
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
        const actual = await actualPixels();
        // Snapshot every temporary paint change synchronously, restoring the scene before
        // native work yields. Callers await frame before advancing or mutating their scene.
        const minusSvg = without(words, () => picture(scene));
        const [exposedSvg, bareSvg] = without([mover], () => [picture(scene), without(words, () => picture(scene))] as const);
        const minusSubjects = await pixels(minusSvg), exposed = await pixels(exposedSvg), bare = await pixels(bareSvg);
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
          const support = await visibleSupport(scene, mover);
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
            witness.proved = moved && await stableForeground(first.foreground, above, first.support, support) &&
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
