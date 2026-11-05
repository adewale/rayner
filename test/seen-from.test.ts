import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Follow, Transform, VMobject, Dot } from '../src/index.ts';
import type { Mobject, Sink } from '../src/index.ts';
import { seenFrom, depthOrder, project, latLon, circleOn, greatArc, between } from '../explain/drawing.ts';
import type { Model3D, Part, Viewpoint, Vec3, Seen } from '../explain/drawing.ts';
import { fc, params } from './lib/pbt.ts';

// A globe with something of every kind: a point and a path on the sphere, a great circle whose far
// half is dashed, a face standing off the sphere (a sheet through the centre), and a rod through it.
const n = latLon(40, -60);
const parts: Part[] = [
  { kind: 'path', key: 'meridians', lines: [-120, -60, 0, 60, 120, 180].map((lon) => Array.from({ length: 81 }, (_, i) => latLon(-80 + 2 * i, lon))), color: '#999' },
  { kind: 'path', key: 'circle', lines: [circleOn(n, 90)], closed: true, color: '#c00', hidden: 'dashed' },
  { kind: 'face', key: 'sheet', rings: [circleOn(n, 90, 1.3), circleOn(n, 90, 1)], fill: '#c00', fillOpacity: 0.2, hidden: 'behind' },
  { kind: 'path', key: 'axis', lines: [[[0, 0, -1.4], [0, 0, 1.4]]], color: '#000', hidden: 'dashed' },
  { kind: 'point', key: 'london', at: latLon(51.5, -0.1), color: '#000', hidden: 'dashed' },
  { kind: 'point', key: 'sydney', at: latLon(-33.9, 151.2), color: '#000' },
];
const model: Model3D = { body: { radius: 1, fill: '#eef', stroke: '#000', key: 'body' }, parts };
const ortho = (yaw: number, pitch: number): Viewpoint => ({ kind: 'orthographic', yaw, pitch });
const seen = (m: Mobject) => (m as Mobject & { seen: Seen }).seen;
const points = (m: Mobject) => (m as VMobject).subpaths.flatMap((a) => Array.from({ length: (a.length - 2) / 6 + 1 }, (_, i) => [a[6 * i]!, a[6 * i + 1]!]));
const viewpoints = fc.record({ yaw: fc.double({ min: -180, max: 180, noNaN: true }), pitch: fc.double({ min: -89, max: 89, noNaN: true }) });

test('seenFrom is pure: the same model and viewpoint draw the same picture', () => {
  const a = seenFrom(model, ortho(-40, 30)), b = seenFrom(model, ortho(-40, 30));
  assert.deepEqual(a.family().map((m) => [m.key, m.constructor.name, m instanceof VMobject ? m.subpaths.map((s) => [...s]) : null, { ...m.style }]),
    b.family().map((m) => [m.key, m.constructor.name, m instanceof VMobject ? m.subpaths.map((s) => [...s]) : null, { ...m.style }]));
});

test('depth order holds at every viewpoint, for every kind', () => {
  fc.assert(fc.property(viewpoints, fc.constantFrom('orthographic', 'perspective', 'gnomonic', 'mercator') as fc.Arbitrary<Viewpoint['kind']>, ({ yaw, pitch }, kind) => {
    const picture = seenFrom(model, { kind, yaw, pitch, ...(kind === 'mercator' ? { pitch: 0 } : {}) }, { scale: 2 });
    assert.equal(depthOrder(picture), true);
    // The same pieces at every viewpoint, so a Follow can redraw the picture frame by frame.
    if (kind === 'orthographic') assert.ok(seenFrom(model, ortho(0, 0)).sameShapeAs(picture));
  }), params(300));
});

test('layers come far, body, near: a hidden piece is always drawn before the body', () => {
  const g = seenFrom(model, ortho(-40, 30));
  const layers = g.children.map((m) => seen(m).layer);
  const body = layers.indexOf('body');
  assert.ok(body > 0 && layers.slice(0, body).every((l) => l === 'far') && layers.slice(body + 1).every((l) => l !== 'far'), layers.join(' '));
  // The rod through the Earth: its middle is inside the body. Its north end leans toward the eye and
  // is drawn after the body; the rest is on the far side and drawn before it, where the body covers
  // what it hides and the south end, past the limb, still shows.
  const rod = g.children.find((m) => m.key === 'axis') as VMobject, back = g.children.find((m) => m.key === 'axis:hidden') as VMobject;
  assert.equal(rod.subpaths.length, 1);
  assert.ok(seen(rod).lines.flat().every((p) => p[2] >= 1 - 1e-6), 'only the stub above the north pole is near');
  assert.ok(seen(back).lines.flat().some((p) => p[2] < -1), 'the south stub is drawn before the body');
});

test('a great circle seen from inside its plane is a straight line through the centre; seen face-on, the outline', () => {
  const pole = latLon(30, -20), circle: Model3D = { body: { radius: 1, fill: 'none', stroke: '#000' }, parts: [{ kind: 'path', key: 'gc', lines: [circleOn(pole, 90, 1, 1)], closed: true, color: '#000' }] };
  // An eye in the plane: the point 90° from the pole along its meridian. The plane then holds the
  // eye and the east–west direction, so the circle is the horizontal diameter.
  const inPlane = ortho(-20, -60);
  const line = points(seenFrom(circle, inPlane, { scale: 3 }).children.find((m) => m.key === 'gc')!);
  for (const [, y] of line) assert.ok(Math.abs(y!) < 1e-5, `y = ${y}`);
  assert.ok(Math.min(...line.map(([x]) => x!)) < -2.99 && Math.max(...line.map(([x]) => x!)) > 2.99, 'through the middle, limb to limb');
  const faceOn = seenFrom(circle, ortho(-20, 30), { scale: 3 }).children.find((m) => m.key === 'gc')!;
  for (const [x, y] of points(faceOn)) assert.ok(Math.abs(Math.hypot(x!, y!) - 3) < 1e-4);
});

test('the gnomonic map draws every great circle straight and never draws the far hemisphere', () => {
  fc.assert(fc.property(viewpoints, viewpoints, viewpoints, (v, a, b) => {
    const pa = latLon(a.pitch, a.yaw), pb = latLon(b.pitch, b.yaw);
    const angle = Math.acos(Math.max(-1, Math.min(1, pa[0] * pb[0] + pa[1] * pb[1] + pa[2] * pb[2])));
    fc.pre(angle > 0.05 && angle < 3.0);
    const vp: Viewpoint = { kind: 'gnomonic', yaw: v.yaw, pitch: v.pitch, limit: 70 };
    const g = seenFrom({ body: { radius: 1, fill: 'none', stroke: '#000' }, parts: [{ kind: 'path', key: 'arc', lines: [greatArc(pa, pb, 2)], color: '#000' }] }, vp);
    assert.equal(depthOrder(g), true);
    const arc = g.children.find((m) => m.key === 'arc') as VMobject;
    const toward = latLon(v.pitch, v.yaw);
    for (const line of seen(arc).lines) for (const p of line) assert.ok(p[0] * toward[0] + p[1] * toward[1] + p[2] * toward[2] > 0.3, 'a point from the far side');
    const pts = points(arc);
    if (pts.length < 3) return;
    const [x0, y0] = pts[0]!, [x1, y1] = pts.at(-1)!, len = Math.hypot(x1! - x0!, y1! - y0!);
    if (len < 1e-3) return;
    for (const [x, y] of pts) assert.ok(Math.abs((x1! - x0!) * (y! - y0!) - (y1! - y0!) * (x! - x0!)) / len < 1e-3 * Math.max(1, len), 'off the straight line');
  }), params(300));
});

test('Mercator draws a constant heading straight, splits strokes at its edge and clips to its window', () => {
  // A rhumb line: evenly spaced in Mercator's northing, so collinear on the map.
  const north = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const lat = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
  const rhumb: Vec3[] = Array.from({ length: 41 }, (_, i) => latLon(lat(north(10) + (north(60) - north(10)) * i / 40), -100 + 90 * i / 40));
  const flat: Model3D = { body: { radius: 1, fill: 'none', stroke: '#000' }, parts: [
    { kind: 'path', key: 'rhumb', lines: [rhumb], color: '#000' },
    { kind: 'path', key: 'equator', lines: [circleOn([0, 0, 1], 90)], closed: true, color: '#000' },
  ] };
  const g = seenFrom(flat, { kind: 'mercator', yaw: 0, pitch: 0 }, { scale: 1 });
  const pts = points(g.children.find((m) => m.key === 'rhumb')!);
  const [x0, y0] = pts[0]!, [x1, y1] = pts.at(-1)!;
  for (const [x, y] of pts) assert.ok(Math.abs((x1! - x0!) * (y! - y0!) - (y1! - y0!) * (x! - x0!)) < 1e-4);
  // The equator, centred on yaw 0, reaches both edges of the map and is not drawn across it.
  const eq = g.children.find((m) => m.key === 'equator') as VMobject;
  for (const s of eq.subpaths) for (let i = 2; i < s.length; i += 2) assert.ok(Math.abs(s[i]! - s[i - 2]!) < 1, 'a stroke spans the map');
  const box = eq.box()!;
  assert.ok(Math.abs(box[0] + Math.PI) < 1e-3 && Math.abs(box[2] - Math.PI) < 1e-3);
  // A window clips, and its cut points are mapped back through the projection.
  const w = seenFrom(flat, { kind: 'mercator', yaw: 0, pitch: 0 }, { window: [-1, -1, 1, 1] });
  assert.equal(depthOrder(w), true);
  const b = w.children.find((m) => m.key === 'rhumb')!.box()!;
  assert.ok(b[0] >= -1 - 1e-6 && b[2] <= 1 + 1e-6 && b[1] >= -1 - 1e-6 && b[3] <= 1 + 1e-6);
});

test('perspective: the limb is smaller than the sphere, and a point beyond the horizon is hidden', () => {
  const g = seenFrom(model, { kind: 'perspective', yaw: 0, pitch: 0, distance: 3 }, { scale: 1 });
  const body = g.children.find((m) => m.key === 'body')!;
  assert.ok(Math.abs(body.width() / 2 - 3 / Math.sqrt(8)) < 1e-3, 'limb radius D/√(D²−1)');
  // 80° from the eye's point is beyond a perspective horizon (cos 80° < 1/3) but within an orthographic one.
  assert.equal(project(latLon(0, 80), { kind: 'perspective', yaw: 0, pitch: 0, distance: 3 }).seen, false);
  assert.equal(project(latLon(0, 80), ortho(0, 0)).seen, true);
});

test('between turns yaw the short way and keeps the kind', () => {
  assert.deepEqual(between(ortho(170, 0), ortho(-170, 20), 0.5), ortho(180, 10));
  assert.throws(() => between(ortho(0, 0), { kind: 'gnomonic', yaw: 0, pitch: 0 }, 0.5), /nothing in between/);
});

// The deliberate defect: a viewpoint change that reaches a picture without redrawing it. What was
// near is now behind the body, still drawn in front, and depthOrder names it.
test('depthOrder fails a picture whose viewpoint changed without a redraw', () => {
  const picture = seenFrom(model, ortho(0, 40));
  assert.equal(depthOrder(picture), true);
  // London was in sight from above the North Atlantic; from the opposite side it is behind the globe.
  const london = picture.children.find((m) => m.key === 'london')!;
  assert.equal(london.style.opacity, 1);
  assert.equal(project(latLon(51.5, -0.1), ortho(180, -40)).seen, false);
  (picture as unknown as { seenPicture: { viewpoint: Viewpoint } }).seenPicture.viewpoint = ortho(180, -40);
  const message = depthOrder(picture);
  assert.equal(typeof message, 'string');
  assert.match(message as string, /from orthographic yaw 180\.0°, pitch -40\.0°/);
  // With only London left to judge, the message names it as drawn in front.
  const alone = seenFrom({ ...model, parts: parts.filter((p) => p.key === 'london') }, ortho(0, 40));
  (alone as unknown as { seenPicture: { viewpoint: Viewpoint } }).seenPicture.viewpoint = ortho(180, -40);
  assert.match(depthOrder(alone) as string, /^london is drawn in front from orthographic yaw 180\.0°, pitch -40\.0°, but the body hides it there/);
});

// The same defect as a camera move: morphing between the two endpoint pictures (a Transform) draws
// every frame from neither viewpoint, and parts on their way behind the globe cross its face. A
// Follow over the viewpoint redraws the globe at each angle and holds at every frame.
test('turning by a morph breaks depth order mid-turn; turning by a Follow holds at every frame', async () => {
  const from = ortho(0, 30), to = ortho(150, 30);
  const sink: Sink = { async frame() {} };
  const morphed = new (class extends Scene { override async construct() {} })(sink);
  const a = seenFrom(model, from), b = seenFrom(model, to);
  morphed.add(a);
  const morph = new Transform(a, b);
  morph.begin();
  morph.interpolate(0.5);
  const broken = depthOrder(a);
  assert.equal(typeof broken, 'string', 'a half-morphed globe is drawn from no viewpoint');
  assert.match(broken as string, /from orthographic yaw 0\.0°, pitch 30\.0°|from where orthographic yaw 0\.0°, pitch 30\.0° puts it/);

  const target = seenFrom(model, from);
  const follow = new Follow({ from: 0, to: 1, draw: (t) => seenFrom(model, between(from, to, t)) }, { targets: [target] });
  follow.begin();
  for (let i = 0; i <= 40; i++) {
    follow.interpolate(i / 40);
    assert.equal(depthOrder(target), true, `frame ${i}`);
  }
  // Its last frame is the picture of the end viewpoint.
  assert.deepEqual(target.children.map((m) => seen(m).lines), seenFrom(model, to).children.map((m) => seen(m).lines));
});

test('a point out of sight is a transparent dot, and a dashed one shows behind the body', () => {
  const g = seenFrom(model, ortho(-0.1, 51.5));
  const sydney = g.children.find((m) => m.key === 'sydney')!, london = g.children.find((m) => m.key === 'london')!;
  assert.ok(sydney instanceof Dot && sydney.style.opacity === 0, 'Sydney is on the far side');
  assert.ok(london instanceof Dot && london.style.opacity === 1);
  assert.equal(g.children.find((m) => m.key === 'london:hidden')!.style.opacity, 0);
});
