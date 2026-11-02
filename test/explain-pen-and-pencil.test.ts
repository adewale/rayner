// The pen-and-pencil model: the hand, the pencil's clipping, region ownership and the Hershey letters,
// held to properties and to Paul Bourke's transcription of the Simplex set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { SIMPLEX } from '../scenes/explainers/lib/hershey-simplex.ts';
import {
  WORLD,
  HAND,
  FREEHAND,
  freehand,
  rng,
  timelineFacts,
  hand,
  pressures,
  pencilWidth,
  deviation,
  hatch,
  boxPolygon,
  insidePolygon,
  unowned,
  inside,
  hershey,
  fit,
  boundsOf,
  tag,
  scenery,
} from '../scenes/explainers/lib/pen-and-pencil.ts';
import type { Pt, Box } from '../scenes/explainers/lib/pen-and-pencil.ts';

const coord = fc.double({ min: -6, max: 6, noNaN: true });
const point = fc.tuple(coord, coord) as fc.Arbitrary<Pt>;
const box = fc
  .tuple(point, fc.double({ min: 0.2, max: 5, noNaN: true }), fc.double({ min: 0.2, max: 5, noNaN: true }))
  .map(([[x, y], w, h]) => [x, y, x + w, y + h] as Box);

test('Simplex holds the 95 printable ASCII glyphs, and A is the three strokes Hershey drew', () => {
  assert.equal(SIMPLEX.length, 95);
  assert.deepEqual(hershey('A'), {
    strokes: [
      [[9, 21], [1, 0]],
      [[9, 21], [17, 0]],
      [[4, 7], [14, 7]],
    ],
    width: 18,
  });
  assert.deepEqual(hershey(' '), { strokes: [], width: 16 });
  // Capitals stand 21 units on the baseline; only Q's tail dips below it.
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const b = boundsOf(hershey(ch).strokes);
    assert.equal(b[3], 21, ch);
    assert.equal(b[1], ch === 'Q' ? -2 : 0, ch);
  }
  assert.equal(hershey('Windmill').strokes.length, 17);
  assert.throws(() => hershey('é'), /no glyph for U\+E9/);
});

test('the same seed draws the same stroke; another seed draws another', () => {
  const line: Pt[] = [
    [0, 0],
    [3, 0],
  ];
  assert.deepEqual(hand(line, HAND, rng(1)), hand(line, HAND, rng(1)));
  assert.notDeepEqual(hand(line, HAND, rng(1)), hand(line, HAND, rng(2)));
});

test('on a straight line the hand starts on it and strays no more than the tremor', () => {
  fc.assert(
    fc.property(point, point, fc.integer(), (a, b, seed) => {
      fc.pre(Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05);
      const ink = hand([a, b], HAND, rng(seed));
      assert.deepEqual(ink[0], a);
      // The spring smooths the tremor, so its sideways swing stays under the tremor's own bound.
      assert.ok(deviation(ink, [a, b]) <= HAND.tremor * Math.SQRT2, `${deviation(ink, [a, b])}`);
      // And it ends near the end: it settles for a moment before the pen lifts.
      const last = ink.at(-1)!;
      assert.ok(Math.hypot(last[0] - b[0], last[1] - b[1]) < 0.02);
    }),
    params(200),
  );
});

test('without tremor, the hand cuts a corner it is driven round', () => {
  const corner: Pt[] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  const ink = hand(corner, { ...HAND, tremor: 0 }, rng(1));
  assert.ok(deviation(ink, corner) > 0.001);
  // Every point the pen passes is inside the corner's own box, give or take the overshoot.
  assert.ok(ink.every((p) => inside(p, [-0.01, -0.03, 1.03, 1.03])));
});

test('pressure stays between 0.8 and 1.2; a pencil dulls, then is re-sharpened', () => {
  for (const p of pressures(500, rng(3))) assert.ok(p >= 0.8 && p <= 1.2);
  assert.equal(pencilWidth(0, 1, 60), 1);
  assert.ok(pencilWidth(59, 1, 60) > 1.5);
  assert.equal(pencilWidth(60, 1, 60), 1);
});

test('every pencil stroke lies inside its convex shape and keeps the hatching angle', () => {
  fc.assert(
    fc.property(box, fc.integer({ min: 0, max: 179 }), fc.double({ min: 0.03, max: 0.3, noNaN: true }), fc.integer(), (b, angle, spacing, seed) => {
      for (const poly of [boxPolygon(b), tag(b)])
        for (const [s, e] of hatch(poly, { angle, spacing, shortfall: spacing * 1.5 }, rng(seed))) {
          assert.ok(insidePolygon(s, poly, 1e-7) && insidePolygon(e, poly, 1e-7));
          const a = (((Math.atan2(e[1] - s[1], e[0] - s[0]) * 180) / Math.PI - angle) % 180 + 180) % 180;
          assert.ok(a < 1e-6 || a > 180 - 1e-6, `${a}`);
        }
    }),
    params(300),
  );
});

test('region ownership keeps every piece of a line off owned paper', () => {
  fc.assert(
    fc.property(fc.array(point, { minLength: 2, maxLength: 6 }), fc.array(box, { maxLength: 4 }), (line, owned) => {
      for (const piece of unowned(line, owned, 0.02))
        for (const p of piece) assert.ok(!owned.some((b) => inside(p, b, -1e-9)));
    }),
    params(300),
  );
});

test('the scenery leaves owned paper bare and runs far to near', () => {
  const owned: Box[] = [
    [-6, -1, 6, 0.2],
    [-7.4, 1.4, -3.7, 3.1],
  ];
  const layers = scenery([-7.55, -0.9, 7.55, 3.15], owned, rng(9));
  assert.deepEqual(
    layers.map((l) => l.name),
    ['hills', 'sea', 'rock', 'lighthouse', 'beam', 'gulls'],
  );
  for (const l of layers)
    for (const p of [...l.pen.flat(), ...l.pencil.flat()]) assert.ok(!owned.some((b) => inside(p, b, -1e-9)), l.name);
});

test('words fit inside their box and are centred in it', () => {
  fc.assert(
    fc.property(box, fc.constantFrom('Dusk', 'Wick trimmed', 'Fog bell rung', "The lamp-keeper's night"), (b, text) => {
      const placed = boundsOf(fit(hershey(text).strokes, b));
      assert.ok(inside([placed[0], placed[1]], b, 1e-9) && inside([placed[2], placed[3]], b, 1e-9));
      assert.ok(Math.abs((placed[0] + placed[2]) / 2 - (b[0] + b[2]) / 2) < 1e-9);
    }),
    params(200),
  );
});

test('the world is a timeline of four periods, one event each, with no positions', () => {
  assert.deepEqual(timelineFacts(WORLD), [
    { period: 'Dusk', events: ['Lamp lit'] },
    { period: 'Midnight', events: ['Wick trimmed'] },
    { period: 'Small hours', events: ['Fog bell rung'] },
    { period: 'Dawn', events: ['Lamp put out'] },
  ]);
  assert.doesNotMatch(WORLD, /\d/);
});

test('a free hand without error reaches every corner it means to; with error, each corner carries the ones before', () => {
  fc.assert(
    fc.property(point, fc.array(point, { minLength: 1, maxLength: 12 }), fc.integer(), (start, moves, seed) => {
      const exact = freehand(start, moves, { angle: 0, length: 0 }, rng(seed));
      let [x, y] = start;
      moves.forEach(([dx, dy], i) => {
        x += dx;
        y += dy;
        assert.ok(Math.abs(exact[i + 1]![0] - x) < 1e-9 && Math.abs(exact[i + 1]![1] - y) < 1e-9);
      });
      // With error, each move is the intended one turned by at most FREEHAND.angle and
      // stretched by at most FREEHAND.length, measured from where the last move ended.
      const drawn = freehand(start, moves, FREEHAND, rng(seed));
      assert.deepEqual(drawn[0], start);
      moves.forEach(([dx, dy], i) => {
        const [ax, ay] = drawn[i]!,
          [bx, by] = drawn[i + 1]!;
        const want = Math.hypot(dx, dy),
          got = Math.hypot(bx - ax, by - ay);
        assert.ok(Math.abs(got - want) <= FREEHAND.length * want + 1e-9);
        if (want > 1e-6) {
          const turn = Math.atan2(dx * (by - ay) - dy * (bx - ax), dx * (bx - ax) + dy * (by - ay));
          assert.ok(Math.abs(turn) <= (FREEHAND.angle * Math.PI) / 180 + 1e-9);
        }
      });
    }),
    params(),
  );
});
