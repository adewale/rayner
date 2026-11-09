// Every in-place write to a path's points ends in touchPoints() (src/mobject.ts), the version the
// path-data cache keys on (VMobject.pathData). A write that missed it would serve the old path.
// This mutates paths through each public API that writes points, after warming the cache, and
// compares the cached path data with the path computed afresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Arc, Arrow, Circle, Dot, Group, Line, Polygon, Rectangle, Text, Transform, VMobject, Brace, Cross, DecimalNumber } from '../src/index.ts';
import type { Mobject } from '../src/index.ts';
import { loadFonts } from '../explain/testing.ts';
import { beginAnimation, interpolateAnimation, finishAnimation } from '../src/animation.ts';

await loadFonts();

const paths = (m: Mobject) => m.family().filter((x): x is VMobject => x instanceof VMobject && x.subpaths.length > 0);

/** Each path whose cached path data, in the mode warmed, is not the path computed afresh from its points. */
function stale(m: Mobject, relative: boolean): string[] {
  return paths(m).flatMap((p, i) => {
    const cached = p.pathData(relative);
    // A copy has no cache of its own (its memo is keyed to its owner), so it computes from the points.
    const fresh = relative ? p.copy().pathData(true) : { d: p.toPathD(), tx: 0, ty: 0 };
    return cached.d === fresh.d && cached.tx === fresh.tx && cached.ty === fresh.ty ? [] : [`path ${i} of ${m.constructor.name}`];
  });
}

/** Shapes of each kind, built fresh for every write. */
const SHAPES: Record<string, () => Mobject> = {
  circle: () => new Circle({ radius: 1 }),
  rectangle: () => new Rectangle({ width: 2, height: 1 }),
  polygon: () => new Polygon([[0, 0], [1, 0], [0.5, 1]]),
  line: () => new Line([-1, 0], [1, 0.5]),
  arc: () => new Arc({ radius: 1, startAngle: 0, angle: 2 }),
  arrow: () => new Arrow([-1, 0], [1, 0]),
  dot: () => new Dot().moveTo([0.3, 0.2]),
  cross: () => new Cross(new Rectangle({ width: 1, height: 1 })),
  brace: () => new Brace(new Rectangle({ width: 2, height: 1 })),
  text: () => new Text('Path cache', { fontSize: 0.4 }),
  group: () => new Group(new Circle({ radius: 0.5 }), new Rectangle({ width: 1, height: 0.5 }).shift([2, 0])),
};

/** Every public way to write a mobject's points in place. */
const WRITES: Record<string, (m: Mobject) => void> = {
  shift: (m) => m.shift([0.37, -0.21]),
  scale: (m) => m.scale(1.7),
  'scale about an edge': (m) => m.scale(0.6, { aboutEdge: [1, 1] }),
  rotate: (m) => m.rotate(0.7),
  moveTo: (m) => m.moveTo([2.3, 1.1]),
  nextTo: (m) => m.nextTo(new Rectangle({ width: 1, height: 1 }).shift([3, 0]), [1, 0]),
  alignTo: (m) => m.alignTo(new Rectangle({ width: 1, height: 1 }).shift([0, 2]), [0, 1]),
  toEdge: (m) => m.toEdge([-1, 0]),
  setWidth: (m) => m.setWidth(3.1),
  setHeight: (m) => m.setHeight(0.4, true),
  stretch: (m) => m.stretch(2.2, 0),
  applyPointsFunction: (m) => m.applyPointsFunction((p) => [p[0] + 0.1 * p[1], p[1] * 1.3]),
  applyAffine: (m) => m.applyAffine(1, 0.2, -0.3, 1.1, 0.5, -0.4),
  arrange: (m) => { if (m.children.length) m.arrange([0, 1]); else m.shift([0.5, 0]); },
  'restore after a move': (m) => { m.saveState(); m.shift([1, 1]).rotate(0.3); m.restore(); },
  become: (m) => m.become(m.copy().shift([0.8, -0.6]).scale(1.2)),
  interpolate: (m) => m.interpolate(m.copy(), m.copy().shift([2, 1]).rotate(1), 0.4),
  'a Transform part-way': (m) => { const t = new Transform(m, m.copy().shift([-1, 0.5]).scale(0.7)); beginAnimation(t); interpolateAnimation(t, 0.5); },
  'a Transform to the end': (m) => { const t = new Transform(m, m.copy().rotate(-0.9)); beginAnimation(t); interpolateAnimation(t, 1); finishAnimation(t); },
};

/** Writes that only some kinds offer. */
const OWN_WRITES: [string, () => Mobject, (m: Mobject) => void][] = [
  ['Line.putStartAndEndOn', SHAPES.line!, (m) => (m as Line).putStartAndEndOn([0, 0], [2, 2])],
  ['Arrow.putStartAndEndOn', SHAPES.arrow!, (m) => (m as Arrow).putStartAndEndOn([0, 1], [-2, -1])],
  ['setPolygon', SHAPES.polygon!, (m) => (m as Polygon).setPolygon([[0, 0], [2, 0], [2, 2], [0, 2]])],
  ['startNewPath and addLineTo', SHAPES.rectangle!, (m) => (m as VMobject).startNewPath([3, 3]).addLineTo([4, 3])],
  ['addCubic and closePath', SHAPES.line!, (m) => (m as VMobject).addCubic([1.5, 1], [1, 1.5], [0, 1]).closePath()],
  ['insertNCurves', SHAPES.circle!, (m) => (m as VMobject).insertNCurves(0, 3)],
  ['Text.setText', SHAPES.text!, (m) => (m as Text).setText('Path data')],
  ['DecimalNumber.setValue', () => new DecimalNumber(3.25), (m) => (m as DecimalNumber).setValue(-41.5)],
];

test('every public write to a path\'s points refreshes its cached path data, in both modes', () => {
  const failures: string[] = [];
  const check = (what: string, make: () => Mobject, write: (m: Mobject) => void) => {
    for (const relative of [true, false]) {
      const m = make();
      assert.deepEqual(stale(m, relative), [], `${what}: fresh`);
      write(m);
      failures.push(...stale(m, relative).map((s) => `${what} (${relative ? 'relative' : 'absolute'}): ${s}`));
    }
  };
  for (const [shape, make] of Object.entries(SHAPES))
    for (const [name, write] of Object.entries(WRITES)) check(`${name} on a ${shape}`, make, write);
  for (const [name, make, write] of OWN_WRITES) check(name, make, write);
  assert.deepEqual(failures, []);
});

test('deliberate defect: a write to a path\'s points that skips touchPoints is caught', () => {
  for (const relative of [true, false]) {
    const c = new Circle({ radius: 1 });
    assert.deepEqual(stale(c, relative), []);
    // Reshape in place, as a careless helper might, without bumping the version.
    c.subpaths[0]![2]! += 0.5;
    assert.deepEqual(stale(c, relative), ['path 0 of Circle'], relative ? 'relative' : 'absolute');
    c.touchPoints();
    assert.deepEqual(stale(c, relative), []);
  }
});
