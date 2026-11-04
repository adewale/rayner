// Property tests for the stage zoom arithmetic (app/embed-zoom.ts), in Node.
// The player's StageZoom only reads the stage size and paints; every number it
// paints comes from these pure functions, so their contracts are the zoom's.
// Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { clampZoom, zoomAt, panBy, readerViewBox, IDENTITY, ZOOM_MAX } from '../app/embed-zoom.ts';
import type { Zoom } from '../app/embed-zoom.ts';

const EPS = Number.EPSILON;

// Stage sizes are clientWidth/clientHeight: non-negative integers, zero included.
const size = fc.nat();
// The cap is a configuration knob: any finite cap of at least 1 (the player uses 6).
const cap = fc.oneof(fc.constant(ZOOM_MAX), fc.double({ min: 1, max: 1e12, noNaN: true }));
// Hostile numbers: NaN, ±Infinity, ±0, negatives, subnormals and huge magnitudes.
// The special values are also drawn on their own, so a 40-gesture session meets them often.
const any = fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity, 0, -0, -1, Number.MIN_VALUE, Number.MAX_VALUE));
const finite = fc.double({ noNaN: true, noDefaultInfinity: true });

type Op =
  | { op: 'zoom'; factor: number; px: number; py: number }
  | { op: 'pan'; dx: number; dy: number }
  | { op: 'reset' }
  | { op: 'resize'; w: number; h: number };
const opOf = (num: fc.Arbitrary<number>): fc.Arbitrary<Op> =>
  fc.oneof(
    fc.record({ op: fc.constant('zoom' as const), factor: num, px: num, py: num }),
    fc.record({ op: fc.constant('pan' as const), dx: num, dy: num }),
    fc.constant({ op: 'reset' as const }),
    fc.record({ op: fc.constant('resize' as const), w: size, h: size }),
  );
/** Each gesture through the pure functions: zoom/pan/reset clamp to the current stage, a resize re-clamps.
 * (StageZoom also scales the pan with the stage on a resize; that is tested on StageZoom below.) */
function play(ops: Op[], w0: number, h0: number, max: number): { z: Zoom; w: number; h: number } {
  let z: Zoom = clampZoom(IDENTITY, w0, h0, max),
    w = w0,
    h = h0;
  for (const o of ops) {
    if (o.op === 'zoom') z = zoomAt(z, o.factor, o.px, o.py, w, h, max);
    else if (o.op === 'pan') z = panBy(z, o.dx, o.dy, w, h, max);
    else if (o.op === 'reset') z = clampZoom(IDENTITY, w, h, max);
    else {
      w = o.w;
      h = o.h;
      z = clampZoom(z, w, h, max);
    }
  }
  return { z, w, h };
}
const session = (num: fc.Arbitrary<number>) =>
  fc.record({ ops: fc.array(opOf(num), { maxLength: 40 }), w: size, h: size, max: cap });
/** A reachable zoom on a stage: what a reader can leave the player in with ordinary (finite) gestures. */
const reachableWith = (max: fc.Arbitrary<number>) =>
  fc
    .record({ ops: fc.array(opOf(finite), { maxLength: 40 }), w: size, h: size, max })
    .map(({ ops, w, h, max }) => ({ ...play(ops, w, h, max), max }));

test('zoom: after any gesture sequence, hostile numbers included, the scale is finite and within [1, max] and the drawing covers the stage', () => {
  fc.assert(
    fc.property(session(any), ({ ops, w, h, max }) => {
      const { z, w: W, h: H } = play(ops, w, h, max);
      assert.ok(Number.isFinite(z.k) && Number.isFinite(z.x) && Number.isFinite(z.y), JSON.stringify(z));
      assert.ok(z.k >= 1 && z.k <= max, `k=${z.k} max=${max}`);
      assert.ok(z.x <= 0 && z.y <= 0, `left/top gap: ${JSON.stringify(z)}`);
      assert.ok(z.x + W * z.k >= W && z.y + H * z.k >= H, `right/bottom gap: ${JSON.stringify({ z, W, H })}`);
    }),
    {
      ...params(),
      // Ledger Z1 (NaN pan) and Z3 (w - w·k rounding a hair short at large w·k).
      examples: [
        [{ ops: [{ op: 'pan', dx: NaN, dy: 0 }], w: 0, h: 0, max: 1 }],
        [{ ops: [{ op: 'zoom', factor: 617606720.9185677, px: 0, py: 0 }, { op: 'pan', dx: -9007199254741028, dy: NaN }], w: 14584037, h: 0, max: 617606720.9185677 }],
        [{ ops: [{ op: 'zoom', factor: 1.7976931348623157e308, px: 0, py: 14460.999999999998 }], w: 0, h: 14461, max: 983381559425.8154 }],
      ],
    },
  );
});

// The "unclamped" subset is constructed, not filtered from the full domain: a
// target scale inside [1, max] gives the factor, and the point's drawing
// coordinate after the zoom must land the pan inside the clamp's bounds (the
// meaning of "unclamped"). Tolerance, fixed before any run: a few roundings on
// the magnitudes involved (px, x, and their difference scaled by the ratio).
const fixedPointCase = fc
  .record({ s: reachableWith(cap), target: fc.double({ min: 0, max: 1, noNaN: true }), u: fc.double({ min: -0.5, max: 1.5, noNaN: true }), v: fc.double({ min: -0.5, max: 1.5, noNaN: true }) })
  .map(({ s, target, u, v }) => ({ ...s, k2: 1 + target * (s.max - 1), px: u * s.w, py: v * s.h }));
const inBounds = (pos: number, side: number, k: number) => pos <= 0 && pos >= side - side * k;
// Standard floating-point error model: each of the few operations in one zoom
// adds at most eps/2 of its operands' magnitude, or one subnormal step near zero.
// `err` bounds one zoom's rounding over the magnitudes it touches; the factor 2·eps
// covers the four roundings in px - (px - x)·(k'/k), and 4·MIN_VALUE their
// subnormal floor. A second zoom by ratio r multiplies the first one's error by r.
const err = (...m: number[]) => 2 * EPS * m.reduce((a, b) => a + Math.abs(b), 0) + 4 * Number.MIN_VALUE;

test('zoom: zoomAt keeps the given stage point over the same drawing point when nothing clamps', () => {
  fc.assert(
    fc.property(fixedPointCase, ({ z, w, h, max, k2, px, py }) => {
      const factor = k2 / z.k;
      // The drawing point under (px, py), in drawing units, before the zoom.
      const u = (px - z.x) / z.k,
        v = (py - z.y) / z.k;
      fc.pre(z.k * factor >= 1 && z.k * factor <= max);
      fc.pre(inBounds(px - u * k2, w, k2) && inBounds(py - v * k2, h, k2));
      const after = zoomAt(z, factor, px, py, w, h, max);
      const u2 = (px - after.x) / after.k,
        v2 = (py - after.y) / after.k;
      // Both drawing coordinates are themselves computed (one subtraction, one division each).
      const ex = err(px, z.x, after.x, (px - z.x) * (after.k / z.k)) / after.k + err(u, u2),
        ey = err(py, z.y, after.y, (py - z.y) * (after.k / z.k)) / after.k + err(v, v2);
      assert.ok(Math.abs(u2 - u) <= ex, `x drift ${u2 - u} > ${ex}`);
      assert.ok(Math.abs(v2 - v) <= ey, `y drift ${v2 - v} > ${ey}`);
    }),
    { ...params(), maxSkipsPerRun: 1000 },
  );
});

test('zoom: zoomAt(f) then zoomAt(1/f) about the same point returns to the start when nothing clamps', () => {
  fc.assert(
    fc.property(fixedPointCase, ({ z, w, h, max, k2, px, py }) => {
      const f = k2 / z.k;
      const u = (px - z.x) / z.k,
        v = (py - z.y) / z.k;
      fc.pre(z.k * f >= 1 && z.k * f <= max);
      fc.pre(inBounds(px - u * k2, w, k2) && inBounds(py - v * k2, h, k2));
      const there = zoomAt(z, f, px, py, w, h, max);
      fc.pre(there.k / f >= 1 && there.k / f <= max);
      const back = zoomAt(there, 1 / f, px, py, w, h, max);
      // k: k·f, 1/f and their product, three roundings.
      assert.ok(Math.abs(back.k - z.k) <= 2 * EPS * z.k, `k ${z.k} -> ${back.k}`);
      const r1 = there.k / z.k,
        r2 = back.k / there.k;
      const ex = err(px, there.x, (px - z.x) * r1) * r2 + err(px, back.x, (px - there.x) * r2),
        ey = err(py, there.y, (py - z.y) * r1) * r2 + err(py, back.y, (py - there.y) * r2);
      assert.ok(Math.abs(back.x - z.x) <= ex, `x ${z.x} -> ${back.x} (> ${ex})`);
      assert.ok(Math.abs(back.y - z.y) <= ey, `y ${z.y} -> ${back.y} (> ${ey})`);
    }),
    { ...params(), maxSkipsPerRun: 1000 },
  );
});

test('zoom: clamping the identity at any stage keeps the identity', () => {
  fc.assert(
    fc.property(size, size, cap, (w, h, max) => {
      const z = clampZoom(IDENTITY, w, h, max);
      assert.ok(z.k === 1 && z.x === 0 && z.y === 0, JSON.stringify(z));
    }),
    params(),
  );
});

test('zoom: zooming all the way out (any factor at or below 1/k) is exactly the identity, whatever the pan was', () => {
  fc.assert(
    fc.property(reachableWith(cap), fc.double({ min: 0, max: 1, noNaN: true }), finite, finite, ({ z, w, h, max }, t, px, py) => {
      const out = zoomAt(z, t / z.k, px, py, w, h, max);
      assert.ok(out.k === 1 && out.x === 0 && out.y === 0, JSON.stringify(out));
    }),
    params(),
  );
});

test('zoom: zooming by a factor of exactly 1 leaves any reachable state unchanged', () => {
  fc.assert(
    fc.property(reachableWith(cap), finite, finite, ({ z, w, h, max }, px, py) => {
      const after = zoomAt(z, 1, px, py, w, h, max);
      assert.ok(after.k === z.k && after.x === z.x && after.y === z.y, `${JSON.stringify(z)} -> ${JSON.stringify(after)}`);
    }),
    params(),
  );
});

test('zoom: zooming further in at the cap leaves the view unchanged', () => {
  fc.assert(
    fc.property(reachableWith(cap), fc.double({ min: 1, noNaN: true }), finite, finite, ({ z, w, h, max }, factor, px, py) => {
      const atCap = zoomAt(z, Infinity, w / 2, h / 2, w, h, max);
      fc.pre(atCap.k === max);
      const after = zoomAt(atCap, factor, px, py, w, h, max);
      assert.ok(after.k === atCap.k && after.x === atCap.x && after.y === atCap.y, `${JSON.stringify(atCap)} -> ${JSON.stringify(after)}`);
    }),
    params(),
  );
});

test('zoom: panning by (0, 0) leaves any reachable state unchanged', () => {
  fc.assert(
    fc.property(reachableWith(cap), ({ z, w, h, max }) => {
      const still = panBy(z, 0, 0, w, h, max);
      assert.ok(still.k === z.k && still.x === z.x && still.y === z.y, JSON.stringify({ z, still }));
    }),
    params(),
  );
});

test('zoom: a pan by any amount never changes the scale', () => {
  fc.assert(
    fc.property(reachableWith(cap), any, any, ({ z, w, h, max }, dx, dy) => {
      assert.equal(panBy(z, dx, dy, w, h, max).k, z.k);
    }),
    params(),
  );
});

// Regression (ledger Z1): NaN deltas and points at infinity used to paint translate(NaNpx, …).
test('zoom: a NaN factor or a point at infinity leaves the view exactly unchanged', () => {
  const hostilePoint = fc.oneof(finite, fc.constantFrom(NaN, Infinity, -Infinity));
  fc.assert(
    fc.property(reachableWith(cap), any, hostilePoint, hostilePoint, ({ z, w, h, max }, f, px, py) => {
      fc.pre(Number.isNaN(f) || !Number.isFinite(px) || !Number.isFinite(py));
      const after = zoomAt(z, f, px, py, w, h, max);
      assert.ok(after.k === z.k && after.x === z.x && after.y === z.y, `${JSON.stringify(z)} -> ${JSON.stringify(after)}`);
    }),
    { ...params(), maxSkipsPerRun: 100 },
  );
});

test('zoom: a NaN pan delta leaves that axis exactly where it was', () => {
  fc.assert(
    fc.property(reachableWith(cap), any, ({ z, w, h, max }, dy) => {
      const after = panBy(z, NaN, dy, w, h, max);
      assert.equal(after.x, z.x);
    }),
    params(),
  );
});

test('zoom: clamping is idempotent (re-clamping on a resize to the same size changes nothing)', () => {
  fc.assert(
    fc.property(session(any), ({ ops, w, h, max }) => {
      const { z, w: W, h: H } = play(ops, w, h, max);
      const again = clampZoom(z, W, H, max);
      assert.ok(again.k === z.k && again.x === z.x && again.y === z.y, JSON.stringify({ z, again }));
    }),
    params(),
  );
});

// ---------------------------------------------------------------------------
// StageZoom itself, on a fake stage: the gestures, the paint and the callback.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
};
const { StageZoom } = await import('../app/embed-zoom.ts');
type Handler = (e: Record<string, unknown>) => void;
function fakeStage(w: number, h: number) {
  const handlers: Record<string, Handler[]> = {};
  const classes = new Set<string>();
  const stage = {
    clientWidth: w,
    clientHeight: h,
    addEventListener(name: string, f: Handler) {
      (handlers[name] ??= []).push(f);
    },
    // A resize assigns clientWidth and clientHeight; the box follows them, as a real element's does.
    getBoundingClientRect: () => ({ left: 0, top: 0, width: stage.clientWidth, height: stage.clientHeight }),
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    setPointerCapture() {},
  };
  const fire = (name: string, e: Record<string, unknown>) => {
    for (const f of handlers[name] ?? []) f({ preventDefault() {}, ...e });
  };
  return { stage: stage as unknown as HTMLElement, classes, fire };
}
type Gesture =
  | { kind: 'down' | 'move'; id: number; x: number; y: number }
  | { kind: 'up' | 'cancel' | 'lost'; id: number }
  | { kind: 'wheel'; ctrl: boolean; dy: number; x: number; y: number }
  | { kind: 'dblclick'; x: number; y: number }
  | { kind: 'zoomIn' | 'zoomOut' | 'reset' | 'apply' };
const coord = fc.oneof(fc.double({ min: -2000, max: 4000, noNaN: true }), finite);
const pointerId = fc.integer({ min: 1, max: 4 });
const gesture: fc.Arbitrary<Gesture> = fc.oneof(
  fc.record({ kind: fc.constantFrom('down' as const, 'move' as const), id: pointerId, x: coord, y: coord }),
  fc.record({ kind: fc.constantFrom('up' as const, 'cancel' as const, 'lost' as const), id: pointerId }),
  fc.record({ kind: fc.constant('wheel' as const), ctrl: fc.boolean(), dy: fc.oneof(finite, fc.integer({ min: -1000, max: 1000 })), x: coord, y: coord }),
  fc.record({ kind: fc.constant('dblclick' as const), x: coord, y: coord }),
  fc.record({ kind: fc.constantFrom('zoomIn' as const, 'zoomOut' as const, 'reset' as const, 'apply' as const) }),
);
function perform(z: InstanceType<typeof StageZoom>, fire: (n: string, e: Record<string, unknown>) => void, g: Gesture, down: Set<number>) {
  if (g.kind === 'down' || g.kind === 'move') {
    if (g.kind === 'down') down.add(g.id);
    fire(g.kind === 'down' ? 'pointerdown' : 'pointermove', { pointerId: g.id, clientX: g.x, clientY: g.y });
  } else if (g.kind === 'up' || g.kind === 'cancel' || g.kind === 'lost') {
    down.delete(g.id);
    fire({ up: 'pointerup', cancel: 'pointercancel', lost: 'lostpointercapture' }[g.kind], { pointerId: g.id });
  } else if (g.kind === 'wheel') fire('wheel', { ctrlKey: g.ctrl, deltaY: g.dy, clientX: g.x, clientY: g.y });
  else if (g.kind === 'dblclick') fire('dblclick', { clientX: g.x, clientY: g.y });
  else if (g.kind === 'zoomIn') z.zoomAt(1.6, undefined, undefined, true);
  else if (g.kind === 'zoomOut') z.zoomAt(1 / 1.6, undefined, undefined, true);
  else if (g.kind === 'reset') z.reset(true);
  else z.apply();
}
const gestures = fc.record({ list: fc.array(gesture, { maxLength: 60 }), w: size, h: size });

test('StageZoom: after any pointer, wheel, double-click and button sequence the stage is covered, finite and within [1, 6]', () => {
  fc.assert(
    fc.property(gestures, ({ list, w, h }) => {
      const { stage, fire } = fakeStage(w, h);
      const z = new StageZoom(stage, () => {}, () => {});
      const down = new Set<number>();
      for (const g of list) perform(z, fire, g, down);
      assert.ok(Number.isFinite(z.k) && Number.isFinite(z.x) && Number.isFinite(z.y), JSON.stringify(z));
      assert.ok(z.k >= 1 && z.k <= 6 && z.x <= 0 && z.y <= 0 && z.x + w * z.k >= w && z.y + h * z.k >= h, JSON.stringify({ k: z.k, x: z.x, y: z.y, w, h }));
    }),
    params(),
  );
});

test('StageZoom: what it paints, the zoomed class and the callback always describe its current zoom', () => {
  fc.assert(
    fc.property(gestures, ({ list, w, h }) => {
      const { stage, classes, fire } = fakeStage(w, h);
      let painted: Zoom | null = null;
      let paintedGlide: boolean | null = null;
      let paintCount = 0;
      let callbackCount = 0;
      let seen: { k: number; x: number; y: number } | null = null;
      const z: InstanceType<typeof StageZoom> = new StageZoom(stage, () => { callbackCount++; seen = { k: z.k, x: z.x, y: z.y }; }, (target, glide) => { painted = { ...target }; paintedGlide = glide; paintCount++; });
      const down = new Set<number>();
      for (const g of list) {
        const beforePaint = paintCount, beforeCallback = callbackCount;
        perform(z, fire, g, down);
        if (paintCount === beforePaint && callbackCount === beforeCallback) continue; // a gesture that does not apply
        assert.equal(paintCount, beforePaint + 1, 'each applied state is painted once');
        assert.equal(callbackCount, beforeCallback + 1, 'each painted state notifies once');
        assert.deepEqual(seen, { k: z.k, x: z.x, y: z.y }, 'the callback saw the final state');
        assert.deepEqual(painted, seen, 'the injected painter received the final state');
        if (paintCount > beforePaint) assert.equal(paintedGlide, ['dblclick', 'zoomIn', 'zoomOut', 'reset'].includes(g.kind));
        assert.equal(classes.has('zoomed'), z.k > 1);
      }
    }),
    params(),
  );
});

// Regression (ledger Z4): pointers 1, 2 down (pinch 100), 3 down, 1 up: the pair 2–3 is 400
// apart but the stale 100 made a motionless move zoom from 1 to 5.
test('StageZoom: a motionless move while exactly two pointers are down never changes the zoom, whatever pointers came and went before', () => {
  fc.assert(
    fc.property(gestures, fc.tuple(coord, coord, coord, coord), ({ list, w, h }, [ax, ay, bx, by]) => {
      const { stage, fire } = fakeStage(w, h);
      const z = new StageZoom(stage, () => {}, () => {});
      const down = new Set<number>();
      for (const g of list) perform(z, fire, g, down);
      // Bring the set of fingers to exactly two by ordinary gestures: lift extras, add new ones.
      for (const id of [...down].slice(2)) perform(z, fire, { kind: 'up', id }, down);
      const fresh = [10, 11];
      if (down.size < 2) perform(z, fire, { kind: 'down', id: fresh[0]!, x: ax, y: ay }, down);
      if (down.size < 2) perform(z, fire, { kind: 'down', id: fresh[1]!, x: bx, y: by }, down);
      const before = { k: z.k, x: z.x, y: z.y };
      // Where is one of the two? Move it to exactly where it is.
      const id = [...down][0]!;
      const last = list.filter((g): g is Extract<Gesture, { kind: 'down' | 'move' }> => (g.kind === 'down' || g.kind === 'move') && g.id === id).at(-1);
      const at = fresh.includes(id) ? (id === fresh[0] ? { x: ax, y: ay } : { x: bx, y: by }) : { x: last!.x, y: last!.y };
      perform(z, fire, { kind: 'move', id, ...at }, down);
      assert.deepEqual({ k: z.k, x: z.x, y: z.y }, before);
    }),
    params(),
  );
});

// Regression (manim-web #389, #838, #871: https://github.com/maloyan/manim-web/pull/389,
// https://github.com/maloyan/manim-web/issues/838, https://github.com/maloyan/manim-web/pull/871).
// Turning a phone while zoomed used to slide the view; the pan now scales with the stage.
test('StageZoom: anisotropic resize preserves the normalized view after noncentral zoom and pan', () => {
  fc.assert(
    fc.property(fc.integer({ min: 200, max: 2000 }), fc.integer({ min: 200, max: 2000 }), fc.double({ min: 1.5, max: 6, noNaN: true }), fc.double({ min: 0.5, max: 2, noNaN: true }), fc.double({ min: 0.5, max: 2, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (w, h, k, rx, ry, u, v) => {
      const { stage } = fakeStage(w, h);
      const z = new StageZoom(stage, () => {}, () => {});
      z.apply();
      z.zoomAt(k, w * u, h * v);
      z.pan(-w * 0.13, h * 0.17);
      const size = stage as unknown as { clientWidth: number; clientHeight: number };
      // The fraction of the drawing's width (height) under the stage centre.
      const centre = (side: number, pan: number) => (side / 2 - pan) / z.k / side;
      const before = [centre(w, z.x), centre(h, z.y)];
      size.clientWidth = Math.round(w * rx);
      size.clientHeight = Math.round(h * ry);
      z.apply(); // what the ResizeObserver callback does
      const after = [centre(size.clientWidth, z.x), centre(size.clientHeight, z.y)];
      assert.ok(Math.abs(after[0]! - before[0]!) <= 16 * EPS && Math.abs(after[1]! - before[1]!) <= 16 * EPS, `centre moved from ${before} to ${after}`);
    }),
    params(300),
  );
});

// Independent screen-space oracle: project world points through the SVG fit, then
// apply reader scale/pan. Each serialized viewBox component rounds by <=0.0005
// user units. Projecting normalized points in [0,1] accumulates <=0.001 units.
const cameraCase = fc.record({
  ax: fc.integer({ min: -100000, max: 100000 }), ay: fc.integer({ min: -100000, max: 100000 }),
  aw: fc.integer({ min: 1, max: 100000 }), ah: fc.integer({ min: 1, max: 100000 }),
  w: fc.integer({ min: 1, max: 4000 }), h: fc.integer({ min: 1, max: 4000 }),
  k: fc.double({ min: 1, max: 6, noNaN: true }),
  u: fc.double({ min: 0, max: 1, noNaN: true }), v: fc.double({ min: 0, max: 1, noNaN: true }),
});
test('readerViewBox composes arbitrary author origins and aspect ratios with stage zoom and letterboxing', () => {
  fc.assert(fc.property(cameraCase, ({ ax, ay, aw, ah, w, h, k, u, v }) => {
    const author = `${ax} ${ay} ${aw} ${ah}`;
    const z = { k, x: -w * (k - 1) * u, y: -h * (k - 1) * v };
    if (k === 1) return assert.equal(readerViewBox(author, z, w, h), author);
    const [vx, vy, vw, vh] = readerViewBox(author, z, w, h).split(/\s+/).map(Number);
    const pxPerUnit = Math.min(w / aw, h / ah);
    for (const [fx, fy] of [[0, 0], [1, 1], [u, v]]) {
      // Reconstruct world point at a chosen stage fraction from the painted view.
      const worldX = vx! + fx! * vw!, worldY = vy! + fy! * vh!;
      const screenX = (((worldX - ax) * pxPerUnit + (w - aw * pxPerUnit) / 2) * k + z.x);
      const screenY = (((worldY - ay) * pxPerUnit + (h - ah * pxPerUnit) / 2) * k + z.y);
      const roundoff = 64 * EPS * (Math.abs(ax) + Math.abs(ay) + aw + ah) * pxPerUnit * k;
      const budget = 0.001 * pxPerUnit * k + roundoff;
      assert.ok(Math.abs(screenX - fx! * w) <= budget, `x projection error ${screenX - fx! * w} > ${budget}`);
      assert.ok(Math.abs(screenY - fy! * h) <= budget, `y projection error ${screenY - fy! * h} > ${budget}`);
    }
  }), params(1000));
});
test('readerViewBox preserves author spelling at identity and when the stage has no area', () => {
  fc.assert(fc.property(cameraCase, fc.constantFrom(' ', ', ', '\t'), ({ ax, ay, aw, ah, w, h, k }, sep) => {
    const author = `  ${[ax, ay, aw, ah].join(sep)}  `;
    assert.equal(readerViewBox(author, IDENTITY, w, h), author);
    for (const [width, height] of [[0, h], [w, 0], [-1, h], [w, -1]])
      assert.equal(readerViewBox(author, { k, x: -1, y: -2 }, width!, height!), author);
  }), params(500));
});
test('StageZoom reset paints exact identity after generated gestures', () => {
  fc.assert(fc.property(gestures, ({ list, w, h }) => {
    const { stage, fire } = fakeStage(w, h);
    const paints: { z: Zoom; glide: boolean }[] = [];
    const z = new StageZoom(stage, () => {}, (value, glide) => paints.push({ z: { ...value }, glide }));
    const down = new Set<number>();
    for (const g of list) perform(z, fire, g, down);
    z.reset(true);
    assert.deepEqual({ k: z.k, x: z.x, y: z.y }, IDENTITY);
    assert.deepEqual(paints.at(-1), { z: IDENTITY, glide: true });
  }), params(500));
});

// A controlled RAF tests cancellation and exact endpoints without sleeping or
// replacing the browser proof of camera writes during real scene animation.
test('ReaderView captures the author camera, follows updates through a glide, and cancels it on Fit', async (t) => {
  const { ReaderView, cameraOf, HOME_VIEW } = await import('../app/embed-zoom.ts');
  let now = 0, next = 0, reduced = false;
  const frames = new Map<number, FrameRequestCallback>();
  const saved = ['requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  t.mock.method(performance, 'now', () => now);
  Object.assign(globalThis, {
    requestAnimationFrame: (f: FrameRequestCallback) => { frames.set(++next, f); return next; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    matchMedia: () => ({ matches: reduced }),
  });
  try {
    const attrs = new Map<string, string>([['viewBox', HOME_VIEW]]);
    const svg = { getAttribute: (key: string) => attrs.get(key) ?? null, setAttribute: (key: string, value: string) => attrs.set(key, value) };
    let present = false;
    const stage = { clientWidth: 800, clientHeight: 450, getBoundingClientRect: () => ({ width: 800, height: 450 }), querySelector: () => present ? svg : null } as unknown as HTMLElement;
    const reader = new ReaderView(stage);
    reader.paint({ k: 2, x: -200, y: -100 }, false); // SVG can be inserted after the reader exists.
    present = true;
    assert.equal(cameraOf(svg as unknown as SVGSVGElement), HOME_VIEW);
    attrs.set('viewBox', 'changed externally');
    assert.equal(cameraOf(svg as unknown as SVGSVGElement), HOME_VIEW, 'first captured author frame remains stable');
    reader.paint({ k: 3, x: -300, y: -200 }, true);
    const tick = (time: number) => {
      now = time;
      const pending = [...frames.values()]; frames.clear();
      for (const f of pending) f(time);
    };
    const author = '-1200 700 8000 4500';
    attrs.set('data-camera', author); // Author frame changed while reader zoom is moving.
    tick(110);
    assert.equal(attrs.get('data-camera'), author);
    // Halfway through cubic ease-out is 7/8 of the journey: k=23/8,
    // pan=(-287.5,-187.5). Independently project the painted corners through
    // the latest author's 0.1 px/unit camera, then this reader transform.
    const midpoint = attrs.get('viewBox')!.split(/\s+/).map(Number);
    const budget = 0.001 * 0.1 * (23 / 8) + 64 * EPS * 800;
    for (const fraction of [0, 1]) {
      const worldX = midpoint[0]! + fraction * midpoint[2]!;
      const worldY = midpoint[1]! + fraction * midpoint[3]!;
      assert.ok(Math.abs((worldX + 1200) * 0.1 * (23 / 8) - 287.5 - fraction * 800) <= budget,
        'mid-glide x uses the latest author camera');
      assert.ok(Math.abs((worldY - 700) * 0.1 * (23 / 8) - 187.5 - fraction * 450) <= budget,
        'mid-glide y uses the latest author camera');
    }
    tick(220);
    assert.equal(attrs.get('viewBox'), readerViewBox(author, { k: 3, x: -300, y: -200 }, 800, 450));
    assert.equal(frames.size, 0, 'the endpoint does not schedule another frame');
    reader.paint({ k: 5, x: -500, y: -300 }, true);
    assert.equal(frames.size, 1);
    reader.paint(IDENTITY, false);
    assert.equal(frames.size, 0, 'Fit cancels the pending glide');
    tick(440);
    assert.equal(attrs.get('viewBox'), author, 'a cancelled glide cannot overwrite Fit');
    reduced = true;
    reader.paint({ k: 2, x: -100, y: -50 }, true);
    assert.equal(frames.size, 0, 'reduced motion paints the target immediately');
    assert.equal(attrs.get('viewBox'), readerViewBox(author, { k: 2, x: -100, y: -50 }, 800, 450));
    attrs.delete('data-camera'); attrs.delete('viewBox');
    assert.equal(cameraOf(svg as unknown as SVGSVGElement), HOME_VIEW, 'an SVG without a frame uses home');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('a fractional stage preserves the planned zoom scale when SVG fits its viewBox', async () => {
  const { ReaderView } = await import('../app/embed-zoom.ts');
  const width = 358, height = 385.625;
  const stage = { clientWidth: width, clientHeight: Math.round(height),
    getBoundingClientRect: () => ({ width, height }) } as unknown as HTMLElement;
  const reader = new ReaderView(stage);
  reader.shown = { k: 2, x: 0, y: 0 };
  const [, , vw, vh] = reader.view('-8000 -4500 16000 9000').split(' ').map(Number);
  // Native SVG preserveAspectRatio chooses the smaller scale. A rounded height
  // would make the second term smaller and shrink an otherwise 12px label.
  const paintedScale = Math.min(width / vw!, height / vh!);
  assert.ok(Math.abs(paintedScale - width * 2 / 16000) < 1e-8);
});
