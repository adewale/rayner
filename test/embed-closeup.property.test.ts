// Property tests for the close-ups a narrow stage opens each step on (app/embed-closeup.ts),
// in Node. The player and `rayner check` both take their phone view from these functions,
// so these contracts are what a phone reader gets: every label near a step's changes at
// 12 px or more, and every change reachable by the overview's tour, with no panning.
// Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { Group, Rectangle, Scene, Text } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { explainer, labelsSaying, restingBox, wordsOutsideCards } from './lib/scenes.ts';
import type { Box } from '../src/index.ts';
import { clampZoom, ZOOM_MAX } from '../app/embed-zoom.ts';
import {
  NARROW_PX,
  partsOf,
  READ_PX,
  closeUp,
  closeUps,
  focusOf,
  labelsToRead,
  stageScale,
  stepLayouts,
  stressStarts,
  viewBox,
} from '../app/embed-closeup.ts';
import type { StepLayout } from '../app/embed-closeup.ts';

test('changed regions include visible stroke width before clipping to the authored viewport', async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({min: 1, max: 6}), fc.integer({min: 1, max: 6}),
    fc.integer({min: -2, max: 2}), fc.integer({min: -1, max: 1}),
    fc.integer({min: 1, max: 20}), fc.boolean(), fc.boolean(), fc.boolean(),
    async (width, height, x, y, hundredths, stroke, opaque, clipped) => {
      class Outlined extends Scene {
        override async construct() {
          await this.step('rectangle');
          const rectangle = new Rectangle({width, height, fill: '#0099ff', stroke: stroke ? '#ff0000' : 'none',
            strokeOpacity: opaque ? 1 : 0, strokeWidth: hundredths / 100}).moveTo([x, y]);
          if (clipped) rectangle.clipBox = [-1, -1, 1, 1];
          this.add(rectangle);
        }
      }
      const layout = (await stepLayouts(Outlined)).get('rectangle')!;
      // Independent axis-aligned rectangle oracle, including disabled strokes.
      const half = stroke && opaque ? hundredths / 200 : 0;
      const clip = clipped ? [-1, -1, 1, 1] : [-8, -4.5, 8, 4.5];
      const expected = [Math.max(x - width / 2 - half, clip[0]!), Math.max(y - height / 2 - half, clip[1]!),
        Math.min(x + width / 2 + half, clip[2]!), Math.min(y + height / 2 + half, clip[3]!)];
      if (expected[2]! < expected[0]! || expected[3]! < expected[1]!) return assert.equal(layout.parts.length, 0);
      assert.equal(layout.painted?.length, 1);
      for (const [i, edge] of expected.entries()) assert.ok(Math.abs(layout.painted![0]![i]! - edge) < 1e-5,
        `edge ${i}: ${layout.painted![0]} must include the visible stroke and respect its clip ${expected}`);
    }), params(60, {examples: [[6, 6, -2, 0, 20, true, true, false]]}));
});

test('stroke outsets do not make an unrelated nearby label determine the reading scale', async () => {
  class Boundary extends Scene {
    override async construct() {
      const rectangle = new Rectangle({width: 2, height: 2, fill: '#0099ff', stroke: '#ff0000', strokeWidth: .2});
      await this.step('before');
      this.add(rectangle, new Text('A', {fontSize: .7}), new Text('Tiny context', {fontSize: .1}).moveTo([1.21, 0], [-1, 0]));
      await this.step('recolour');
      rectangle.setFill('#ff9900');
    }
  }
  const layout = (await stepLayouts(Boundary)).get('recolour')!;
  assert.ok(layout.painted![0]![2] > 1.09, 'the outer stroke remains part of the tour coverage');
  assert.equal(labelsToRead(layout).length, 1, 'the nearby context is outside the changed subject');
  assert.ok(Math.abs(labelsToRead(layout)[0]!.size - .7) < 1e-6);
  assert.equal(closeUps(layout, 357, 201)[0]!.k, 1, 'readable content keeps its complete opening');
});

/** A box inside the 16 × 9 frame, at least `min` units on a side. */
const boxIn = (min = 0) =>
  fc
    .tuple(
      fc.double({ min: -8, max: 8 - min, noNaN: true }),
      fc.double({ min: -4.5, max: 4.5 - min, noNaN: true }),
      fc.double({ min, max: 16, noNaN: true }),
      fc.double({ min, max: 9, noNaN: true }),
    )
    .map(([x, y, w, h]): Box => [x, y, Math.min(8, x + w), Math.min(4.5, y + h)]);
const layoutArb: fc.Arbitrary<StepLayout> = fc.array(boxIn(), { minLength: 1, maxLength: 6 }).chain((parts) =>
  fc.record(
    {
      parts: fc.constant(parts),
      lead: fc.nat({ max: parts.length - 1 }),
      labels: fc.array(fc.record({ box: boxIn(), size: fc.double({ min: 0.05, max: 0.8, noNaN: true }) }), { maxLength: 12 }),
      // What the step emphasised: often nothing, else a few boxes, some inside a part.
      stress: fc.array(fc.oneof(boxIn(), fc.constantFrom(...parts)), { maxLength: 4 }),
    },
    { requiredKeys: ['parts', 'lead', 'labels'] },
  ),
);
const holds = (v: Box, [x, y]: readonly [number, number]) => x >= v[0] - 1e-6 && x <= v[2] + 1e-6 && y >= v[1] - 1e-6 && y <= v[3] + 1e-6;
// Contract oracle: a nonzero span must share an interval, rather than merely
// touch an edge. A genuinely zero-length emphasised span is a line/point and
// belongs wherever its coordinate lies in the part. No fuzzy size cutoff turns
// a positive-width box into a line or removes a positive-area intersection.
function expectedStressStarts(layout: StepLayout): [number, number][] {
  const crosses = (lo: number, hi: number, pLo: number, pHi: number) =>
    lo === hi ? pLo <= lo && lo <= pHi : Math.max(lo, pLo) < Math.min(hi, pHi);
  const points: [number, number][] = [];
  for (const stress of layout.stress ?? [])
    for (const part of layout.parts)
      if (crosses(stress[0], stress[2], part[0], part[2]) && crosses(stress[1], stress[3], part[1], part[3]))
        points.push([Math.max(stress[0], part[0]), Math.min(stress[3], part[3])]);
  return points;
}
/** A stage: a phone's or a laptop's, mostly 16:9 as the player's is, sometimes not. */
const stageArb = fc.oneof(
  fc.integer({ min: 120, max: 1600 }).map((w) => ({ w, h: Math.round((w * 9) / 16) })),
  fc.record({ w: fc.integer({ min: 120, max: 1600 }), h: fc.integer({ min: 60, max: 1200 }) }),
);

test('a stage NARROW_PX wide or wider keeps the whole picture: one close-up, the identity', () => {
  fc.assert(
    fc.property(layoutArb, fc.integer({ min: NARROW_PX, max: 4000 }), fc.integer({ min: 1, max: 3000 }), (layout, w, h) => {
      assert.deepEqual(closeUps(layout, w, h), [{ k: 1, x: 0, y: 0 }]);
    }),
    params(300),
  );
});

test('every close-up of a step is clamped (the drawing covers the stage) and they share one scale in [1, max]', () => {
  fc.assert(
    fc.property(layoutArb, stageArb, (layout, { w, h }) => {
      const tour = closeUps(layout, w, h);
      assert.ok(tour.length >= 1);
      for (const z of tour) {
        assert.deepEqual(clampZoom(z, w, h), z);
        assert.equal(z.k, tour[0]!.k);
        assert.ok(z.k >= 1 && z.k <= ZOOM_MAX);
      }
      assert.deepEqual(closeUp(layout, w, h), tour[0]);
    }),
    params(500),
  );
});

test('on a narrow stage every label near the changes reads at READ_PX whenever the zoom cap allows, by the least zoom that does it', () => {
  fc.assert(
    fc.property(layoutArb, stageArb, (layout, { w, h }) => {
      fc.pre(w < NARROW_PX);
      const { k } = closeUp(layout, w, h),
        { s } = stageScale(w, h),
        read = layout.labels.filter((label) => layout.parts.some((part) =>
          label.box[0] <= part[2] + 0.2 && label.box[2] >= part[0] - 0.2 &&
          label.box[1] <= part[3] + 0.2 && label.box[3] >= part[1] - 0.2));
      // With no nearby label the reader uses all labels. This oracle derives
      // relevance from the documented padding, without calling its selector.
      if (!read.length) read.push(...layout.labels);
      assert.deepEqual(labelsToRead(layout), read);
      if (!read.length) return void assert.equal(k, 1);
      const drawn = read.map((l) => l.size * s * k);
      // No nearby label under READ_PX after the close-up when the cap leaves room to reach it.
      const possible = READ_PX / (Math.min(...read.map((l) => l.size)) * s) <= ZOOM_MAX;
      if (possible) for (const px of drawn) assert.ok(px >= READ_PX - 1e-9, `${px} px at k=${k}`);
      // Least: no zoom at all, the cap, or the smallest label lands exactly on READ_PX.
      assert.ok(k === 1 || k === ZOOM_MAX || Math.abs(Math.min(...drawn) - READ_PX) < 1e-9, `k=${k} is more than reading needs`);
    }),
    params(500),
  );
});

test('a label a few percent under READ_PX is enlarged, not left on the whole picture', () => {
  // A phone's stage, 358 × 201: a 0.5-unit label draws at 11.2 px and needs 1.07×.
  const [w, h] = [358, 201],
    { s } = stageScale(w, h);
  for (const size of [0.488, 0.5, 0.536]) {
    const layout: StepLayout = { parts: [[-1, -0.5, 1, 0.5]], lead: 0, labels: [{ box: [-0.8, -0.2, 0.8, 0.2], size }] };
    const { k } = closeUp(layout, w, h);
    assert.ok(k > 1, `${size}: k=${k}`);
    assert.ok(size * s * k >= READ_PX - 1e-9, `${size}: ${size * s * k} px`);
  }
  // One already at READ_PX keeps the whole picture.
  const read: StepLayout = { parts: [[-1, -0.5, 1, 0.5]], lead: 0, labels: [{ box: [-0.8, -0.2, 0.8, 0.2], size: READ_PX / s }] };
  assert.deepEqual(closeUps(read, w, h), [{ k: 1, x: 0, y: 0 }]);
});

test('the tour of close-ups covers every changed part: each point of a change is inside some close-up', () => {
  fc.assert(
    fc.property(layoutArb, stageArb, (layout, { w, h }) => {
      const views = closeUps(layout, w, h).map((z) => viewBox(z, w, h));
      // A view's edge may round by a hair of a unit; compare with that slack.
      const slack = 1e-6;
      for (const p of layout.parts) {
        // Rectangle membership is constant between adjacent view boundaries.
        // Check those cells AND boundaries, including zero-area changed boxes.
        const cuts = (lo: number, hi: number, axis: 0 | 1) => {
          const edges = [lo, hi, ...views.flatMap((v) => [v[axis]! - slack, v[axis + 2]! + slack])]
            .filter((x) => x >= lo && x <= hi).sort((a, b) => a - b);
          return [...edges, ...edges.slice(1).map((x, i) => edges[i]! + (x - edges[i]!) / 2)];
        };
        for (const x of cuts(p[0], p[2], 0))
          for (const y of cuts(p[1], p[3], 1))
            assert.ok(views.some((v) => x >= v[0] - slack && x <= v[2] + slack && y >= v[1] - slack && y <= v[3] + slack),
              `(${x}, ${y}) of part ${JSON.stringify(p)} is in no close-up: ${JSON.stringify(views)}`);
      }
    }),
    params(500),
  );
});

test('a part padded to exactly one view wide gets one view, not none', () => {
  // fast-check found it: the padding makes the span a rounding wider than the view, which split it into one view over 0.
  const layout: StepLayout = { parts: [[0, 0, 2.4018880411591708, 0], [0, 0, 0, 0]], lead: 0, labels: [{ box: [0, 0, 0, 0], size: 0.05 }] };
  const tour = closeUps(layout, 120, 66);
  for (const z of tour) assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y), JSON.stringify(z));
  const views = tour.map((z) => viewBox(z, 120, 66));
  assert.ok(views.some((v) => v[0] <= 1e-6 && v[2] >= 2.4018880411591708 - 1e-6), JSON.stringify(views));
});

test('a step opens on its lead part: whole when it fits the view, else from its top-left corner', () => {
  fc.assert(
    fc.property(layoutArb, stageArb, (layout, { w, h }) => {
      fc.pre(w < NARROW_PX);
      const z = closeUp(layout, w, h);
      fc.pre(z.k > 1);
      const v = viewBox(z, w, h),
        first = layout.parts[layout.lead]!,
        slack = 1e-6;
      const fits = first[2] - first[0] <= v[2] - v[0] && first[3] - first[1] <= v[3] - v[1];
      const corners: [number, number][] = fits
        ? [[first[0], first[1]], [first[2], first[3]]]
        : [[first[0], first[3]]];
      for (const [x, y] of corners)
        assert.ok(x >= v[0] - slack && x <= v[2] + slack && y >= v[1] - slack && y <= v[3] + slack, `${x},${y} not in ${v}`);
    }),
    params(500),
  );
});

test('changes merge into parts in reading order, and the part with the most new lettering leads, then the most moved', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ box: boxIn(), text: fc.boolean(), moved: fc.boolean() }), { minLength: 1, maxLength: 10 }),
      (changes) => {
        const { parts, lead } = partsOf(changes);
        // Every change lies in exactly one part, and the parts keep apart.
        for (const c of changes) {
          const holding = parts.filter((p) => p[0] <= c.box[0] && p[1] <= c.box[1] && p[2] >= c.box[2] && p[3] >= c.box[3]);
          assert.equal(holding.length, 1, 'each change belongs to exactly one part');
        }
        for (let i = 1; i < parts.length; i++) {
          const a = parts[i - 1]!, b = parts[i]!;
          const rowA = Math.floor(-a[3]), rowB = Math.floor(-b[3]);
          assert.ok(rowA < rowB || (rowA === rowB && a[0] <= b[0]), 'parts follow rows top to bottom, then left to right');
        }
        const count = (p: Box, moved: boolean) =>
          changes.filter((c) => c.text && c.moved === moved && p[0] <= c.box[0] && p[1] <= c.box[1] && p[2] >= c.box[2] && p[3] >= c.box[3]).length;
        // New lettering first, moved lettering to break ties: one number that orders both.
        const rank = parts.map((p) => count(p, false) * 1000 + count(p, true));
        // Parts are disjoint, so a change inside one is counted there alone.
        assert.equal(parts.reduce((n, p) => n + count(p, false) + count(p, true), 0), changes.filter((c) => c.text).length);
        assert.equal(rank[lead], Math.max(...rank));
        assert.equal(lead, rank.indexOf(Math.max(...rank)), 'ties go to the earlier part in reading order');
      },
    ),
    params(500),
  );
});

/** A scene of `n` rectangles in one group; the second step recolours `marked` and dims `dimmed`. */
function sceneOf(rects: Box[], marked: Set<number>, dimmed: Set<number>, labelled: boolean) {
  return class extends Scene {
    override async construct() {
      const shapes = rects.map(
        (b) =>
          new Rectangle({ width: b[2] - b[0], height: b[3] - b[1], fill: '#336699', stroke: '#000000' }).moveTo([
            (b[0] + b[2]) / 2,
            (b[1] + b[3]) / 2,
          ]),
      );
      const group = new Group(...shapes);
      await this.step('first');
      this.add(group);
      // A label of its own, outside the group: not dimmed, so not part of what a dim points at.
      if (labelled) this.add(new Text('a label', { fontSize: 0.25 }).moveTo([0, -4]));
      await this.wait(0.1);
      await this.step('second');
      shapes.forEach((s, i) => {
        if (marked.has(i)) s.setFill('#cc3300');
        if (dimmed.has(i)) s.setStyle({ opacity: 0.3 });
      });
      await this.wait(0.1);
    }
  };
}
const union = (boxes: Box[]): Box | null =>
  boxes.reduce<Box | null>(
    (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : [...b]),
    null,
  );
const near = (a: Box | null, b: Box | null) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]!) < 1e-3);

test('a step changes where it recolours; a step that only dims points at what it left bright', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(boxIn(0.1), { minLength: 1, maxLength: 6 }).chain((rects) =>
        fc.record({
          rects: fc.constant(rects),
          roles: fc.array(fc.constantFrom('mark', 'dim', 'none'), { minLength: rects.length, maxLength: rects.length }),
          labelled: fc.boolean(),
        }),
      ),
      async ({ rects, roles, labelled }) => {
        const marked = new Set(roles.flatMap((r, i) => (r === 'mark' ? [i] : []))),
          dimmed = new Set(roles.flatMap((r, i) => (r === 'dim' ? [i] : [])));
        const layouts = await stepLayouts(sceneOf(rects, marked, dimmed, labelled));
        const first = layouts.get('first')!,
          second = layouts.get('second')!;
        // The first step brings everything in, so all of it changed.
        assert.ok(first.parts.length >= 1);
        for (const r of rects) assert.ok(first.parts.some((p) => p[0] <= r[0] + 1e-3 && p[2] >= r[2] - 1e-3 && p[1] <= r[1] + 1e-3 && p[3] >= r[3] - 1e-3));
        const pick = (keep: (i: number) => boolean) => rects.filter((_, i) => keep(i));
        const expected = marked.size
          ? union(pick((i) => marked.has(i)))
          : dimmed.size && dimmed.size < rects.length
            ? union(pick((i) => !dimmed.has(i)))
            : null;
        if (expected) assert.ok(near(focusOf(second), expected), `${JSON.stringify(focusOf(second))} != ${JSON.stringify(expected)}`);
        // Parts never touch: any two are more than the merging gap apart.
        for (const [i, a] of second.parts.entries())
          for (const b of second.parts.slice(i + 1))
            assert.ok(a[0] - 0.5 > b[2] || b[0] - 0.5 > a[2] || a[1] - 0.5 > b[3] || b[1] - 0.5 > a[3]);
        assert.equal(second.labels.length, labelled ? 1 : 0);
      },
    ),
    params(60),
  );
});

test('emphasis orders the tour and changes nothing else: the same close-ups, the same first one', () => {
  fc.assert(
    fc.property(layoutArb, stageArb, (layout, { w, h }) => {
      const tour = closeUps(layout, w, h),
        plain = closeUps({ ...layout, stress: undefined }, w, h);
      assert.deepEqual(tour[0], plain[0]);
      const key = (z: { k: number; x: number; y: number }) => `${z.k.toFixed(6)} ${z.x.toFixed(4)} ${z.y.toFixed(4)}`;
      assert.deepEqual(tour.map(key).sort(), plain.map(key).sort());
    }),
    params(500),
  );
});

test('where emphasis starts is exactly the top-left of each box-part intersection, including thin spans and lines', () => {
  fc.assert(
    fc.property(layoutArb, (layout) => {
      assert.deepEqual(stressStarts(layout), expectedStressStarts(layout));
    }),
    { ...params(500), examples: [[{
      parts: [[0.9999995, 0, 2, 1]], lead: 0, labels: [], stress: [[0, 0, 1, 1]],
    }], [{ parts: [[1, 0, 2, 1]], lead: 0, labels: [], stress: [[0, 0, 1, 1]] }],
      [{ parts: [[1, 0, 2, 1]], lead: 0, labels: [], stress: [[0.9999995, 0, 1, 1]] }],
      [{ parts: [[0, 0, 2, 1]], lead: 0, labels: [], stress: [[1, 0, 1, 1]] }]] },
  );
});

test('after the first close-up, every close-up that shows where an emphasised thing starts comes before any that does not', () => {
  fc.assert(
    fc.property(layoutArb, stageArb, (layout, { w, h }) => {
      const marks = expectedStressStarts(layout);
      const plain = closeUps({ ...layout, stress: undefined }, w, h);
      const prioritised = (z: { k: number; x: number; y: number }) => marks.some((m) => holds(viewBox(z, w, h), m));
      const following = plain.slice(1);
      const expected = [plain[0]!, ...following.filter(prioritised), ...following.filter((z) => !prioritised(z))];
      assert.deepEqual(closeUps(layout, w, h), expected,
        'emphasis stably partitions the same exact views after the opening view');
    }),
    params(500),
  );
});

test('a step records what it emphasised with the helpers, and only that step', async () => {
  class Marks extends Scene {
    override async construct() {
      const s = stage(this, { heading: false });
      await this.step('card');
      const card = await s.card([['first', 1], ['second', 2], ['third', 3]], { at: [4, -2] });
      await card.mark('third');
      await this.step('code');
      const code = await s.code(['let a = 1;', 'let b = 2;'], { at: [-4, 2] });
      await code.focus(1);
      await this.step('quiet');
      await card.set({ first: 10 });
      await this.step('unlit');
      await card.mark('first');
      await card.mark(null);
      await this.step('moved');
      await code.focus(0);
    }
  }
  const layouts = await stepLayouts(Marks);
  // Each emphasised box is the lit bar: inside its card, a row high.
  const [card] = layouts.get('card')!.stress!;
  assert.ok(card && card[0] > 2 && card[1] < -2 && card[3] - card[1] < 0.6, JSON.stringify(card));
  const [code] = layouts.get('code')!.stress!;
  assert.ok(code && code[2] < 0 && code[1] > 0, JSON.stringify(code));
  assert.equal(layouts.get('code')!.stress!.length, 1, 'the card row lit a step earlier is not this step\'s emphasis');
  assert.equal(layouts.get('quiet')!.stress, undefined, 'a step that marks nothing emphasised nothing');
  assert.equal(layouts.get('unlit')!.stress, undefined, 'a mark taken back in the step is no emphasis');
  // The same focus bar on another line is new emphasis, where that line is.
  const [moved] = layouts.get('moved')!.stress!;
  assert.ok(moved && moved[1] > code[3] - 1e-6, `${JSON.stringify(moved)} is the first line, above ${JSON.stringify(code)}`);
});

// Issue #21: on a phone, PKCE's `authorize` caption says the verifier stays with the client
// and is not sent, as the note under the request says, and the first step's caption describes deriving the
// challenge from the verifier. Both are in a close-up the overview reaches in one press: the
// card was the 7th of 7 close-ups, and the derivation the 4th of 6.
test('PKCE on a phone: what each caption points at is in the first close-up or the next (issue #21)', async () => {
  const Scene = await explainer('oauth-pkce'),
    layouts = await stepLayouts(Scene);
  // The 358 × 201 stage of a 390 px page, the one `rayner check` measures.
  const [w, h] = [358, 201];
  const within = (b: Box, v: Box) => b[0] >= v[0] - 1e-6 && b[2] <= v[2] + 1e-6 && b[1] >= v[1] - 1e-6 && b[3] <= v[3] + 1e-6;
  const evidence: [string, Box][] = [
    ['authorize', await restingBox(Scene, 'authorize', (scene) => labelsSaying(scene, 'verifier not sent'))],
    ['secret', await restingBox(Scene, 'secret', (scene) => wordsOutsideCards(scene, 'code_verifier', 'SHA-256'))],
  ];
  for (const [step, box] of evidence) {
    const views = closeUps(layouts.get(step), w, h).map((z) => viewBox(z, w, h));
    assert.ok(views.length > 1, `${step} needs a tour on a phone`);
    const at = views.findIndex((v) => within(box, v));
    assert.ok(at === 0 || at === 1, `${step}: ${JSON.stringify(box)} first whole in close-up ${at + 1} of ${views.length}`);
  }
});

/** A layout under a heading: the heading's bottom edge somewhere in the top half. */
const headedArb: fc.Arbitrary<StepLayout> = fc
  .tuple(layoutArb, fc.double({ min: 0.5, max: 4.4, noNaN: true }))
  .map(([layout, top]) => ({ ...layout, top }));

test('a readable label that fits a permitted view is whole in some close-up', () => {
  fc.assert(
    fc.property(fc.oneof(layoutArb, headedArb), stageArb,
      fc.double({ min: 1, max: ZOOM_MAX, noNaN: true }), (layout, { w, h }, max) => {
        const tour = closeUps(layout, w, h, max),
          k = tour[0]!.k,
          scale = Math.min(w / 16, h / 9),
          offsetX = (w - 16 * scale) / 2,
          offsetY = (h - 9 * scale) / 2,
          viewWidth = w / (k * scale),
          viewHeight = h / (k * scale),
          ceiling = Math.min(4.5, Math.max(layout.top ?? 4.5, ...layout.parts.map((p) => p[3])));
        // Relevance is the documented 0.2-unit padding, not the production selector.
        const near = layout.labels.filter((label) => layout.parts.some((part) =>
          label.box[0] <= part[2] + 0.2 && label.box[2] >= part[0] - 0.2 &&
          label.box[1] <= part[3] + 0.2 && label.box[3] >= part[1] - 0.2));
        const read = near.length ? near : layout.labels;
        for (const { box } of read) {
          if (box[2] - box[0] > viewWidth || box[3] - box[1] > viewHeight ||
              box[0] < -8 || box[2] > 8 || box[1] < -4.5 || box[3] > ceiling) continue;
          // Forward project authored corners into CSS pixels. Do not use the
          // production inverse (viewBox) to decide whether the whole label is shown.
          const complete = tour.some((z) => {
            const left = ((box[0] + 8) * scale + offsetX) * z.k + z.x,
              right = ((box[2] + 8) * scale + offsetX) * z.k + z.x,
              top = ((4.5 - box[3]) * scale + offsetY) * z.k + z.y,
              bottom = ((4.5 - box[1]) * scale + offsetY) * z.k + z.y,
              slack = 1e-6 * scale * z.k; // existing scene-unit serialization allowance
            return left >= -slack && right <= w + slack && top >= -slack && bottom <= h + slack;
          });
          assert.ok(complete, `label ${JSON.stringify(box)} is split across every view at ${w} × ${h}, max ${max}`);
        }
      }),
    params<[StepLayout, { w: number; h: number }, number]>(500, { examples: [[{
      parts: [[-4, -3, 4, 3]], lead: 0,
      labels: [{ box: [-2.6, -0.2, 2.6, 0.2], size: 0.2 }],
    }, { w: 320, h: 180 }, ZOOM_MAX]] }),
  );
});

test('with a heading, no close-up cuts through it: each stays below its bottom edge unless a change reaches above it', () => {
  fc.assert(
    fc.property(headedArb, stageArb, (layout, { w, h }) => {
      fc.pre(w < NARROW_PX);
      const tour = closeUps(layout, w, h);
      if (tour[0]!.k === 1) return; // the whole picture shows the heading whole
      const ceiling = Math.min(4.5, Math.max(layout.top!, ...layout.parts.map((p) => p[3])));
      // A view's top edge is under the heading or above all of it, never in it (unless the zoom cap leaves no room).
      for (const z of tour) {
        if (z.k === ZOOM_MAX) continue;
        const v = viewBox(z, w, h);
        // 1e-4 units: the zoom is clamped in pixels, which rounds a view's edge by far less than a pixel.
        assert.ok(v[3] <= ceiling + 1e-4 || v[3] >= 4.5 - 1e-4, `view ${v} cuts the heading at ${ceiling}`);
      }
    }),
    params(500),
  );
});

test('with a heading, a close-up zooms no further than reading, or fitting under the heading, needs', () => {
  fc.assert(
    fc.property(headedArb, stageArb, (layout, { w, h }) => {
      fc.pre(w < NARROW_PX);
      const { k } = closeUp(layout, w, h),
        { s } = stageScale(w, h),
        read = labelsToRead(layout);
      if (!read.length || k === 1 || k === ZOOM_MAX) return;
      const ceiling = Math.min(4.5, Math.max(layout.top!, ...layout.parts.map((p) => p[3])));
      const reading = READ_PX / (Math.min(...read.map((l) => l.size)) * s),
        fit = ceiling < 4.5 && h / (reading * s) < 9 - 1e-9 ? h / ((ceiling + 4.5) * s) : 1;
      assert.ok(Math.abs(k - Math.max(reading, fit)) < 1e-9, `k=${k}, reading ${reading}, fit ${fit}`);
      // Every label near the changes still reads at READ_PX.
      for (const l of read) assert.ok(l.size * s * k >= READ_PX - 1e-9);
    }),
    params(500),
  );
});

test('stepLayouts records where the stage heading ends, and a phone close-up of a change just under it stays below it', async () => {
  const { stage } = await import('../explain/index.ts');
  class Headed extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one', { title: 'A title over the picture', line: 'A line under the title.' });
      const small = new Text('a small label near the top', { fontSize: 0.2 }).moveTo([-4, 2.9]);
      await s.enter(small, { describe: 'a label' });
    }
  }
  const layout = (await stepLayouts(Headed)).get('one')!;
  assert.ok(layout.top! > 3 && layout.top! < 3.8, `top ${layout.top}`);
  const [w, h] = [358, 201];
  for (const z of closeUps(layout, w, h)) {
    assert.ok(z.k > 1);
    const v = viewBox(z, w, h);
    assert.ok(v[3] <= layout.top! + 1e-6, `view ${v} cuts the heading at ${layout.top}`);
  }
});

test('a block of text carried aside is a moved part, and the step opens on what it brought new', async () => {
  for (const scale of [1, 0.5]) {
    class Carry extends Scene {
      override async construct() {
        const block = new Group(
          ...['five lines of code that', 'the previous step showed', 'and this step only moves', 'into the corner, out of', 'the way of the new part'].map((t, i) =>
            new Text(t, { fontSize: 0.3 }).moveTo([0, 1 - i * 0.45]),
          ),
        );
        await this.step('show');
        this.add(block);
        await this.wait(0.1);
        await this.step('carry');
        await this.play(block.animate.scale(scale).moveTo([-5, 3]));
        this.add(new Text('2.96 units', { fontSize: 0.25 }).moveTo([3, -3]));
        await this.wait(0.1);
      }
    }
    const layout = (await stepLayouts(Carry)).get('carry')!;
    assert.equal(layout.parts.length, 2, JSON.stringify(layout.parts));
    const lead = layout.parts[layout.lead]!;
    assert.ok(lead[0] > 2 && lead[3] < -2, `scale ${scale}: opens on the new label, not the carried block: ${JSON.stringify(lead)}`);
  }
});
