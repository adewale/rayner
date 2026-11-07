import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Line, Rectangle, Group } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import { restingRouteProblems } from '../tools/lib/explain-layout.ts';
import { fc, params } from './lib/pbt.ts';
await loadFonts();

const label = (imported: boolean) => imported
  ? Object.assign(new Group(new Rectangle({ width: 1, height: 0.4, stroke: 'none', fill: '#ffffff' })), { text: 'target', fontSize: 0.4, emRatio: 1 })
  : new Text('target', { fontSize: 0.4 }).moveTo([0, 0]);

test('a painted route through a native or imported label is rejected at any angle', () => {
  fc.assert(fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), fc.boolean(), (angle, imported) => {
    const s = new Scene(new NullSink());
    const line = new Line([-2 * Math.cos(angle), -2 * Math.sin(angle)], [2 * Math.cos(angle), 2 * Math.sin(angle)]);
    s.add(line, label(imported));
    assert.deepEqual(restingRouteProblems(s), ['A connector crosses "target"']);
  }), params(300));
});

test('only an opaque plate above the route and below the label protects the lettering', () => {
  for (const order of ['above', 'below', 'after-text'] as const) for (const opacity of [0, 0.2, 1]) {
    const s = new Scene(new NullSink());
    const line = new Line([-2, 0], [2, 0]);
    const text = label(false);
    const plate = new Rectangle({ width: 2, height: 0.8, fill: '#000000', fillOpacity: opacity, stroke: 'none' });
    s.add(...(order === 'above' ? [line, plate, text] : order === 'below' ? [plate, line, text] : [line, text, plate]));
    assert.equal(restingRouteProblems(s).length, order === 'above' && opacity === 1 ? 0 : 1, `${order}, opacity ${opacity}`);
  }
});

test('routes outside a clip or camera and invisible route helpers do not obstruct lettering', () => {
  const text = label(false), line = new Line([-2, 0], [2, 0]);
  const s = new Scene(new NullSink()).add(line, text);
  line.setOpacity(0);
  assert.deepEqual(restingRouteProblems(s), []);
  line.setOpacity(1);
  line.clipBox = [3, -1, 4, 1];
  assert.deepEqual(restingRouteProblems(s), []);
  delete line.clipBox;
  s.frame.moveTo([6, 0]).scale(0.2);
  assert.deepEqual(restingRouteProblems(s), []);
});

test('a plate clipped away from the lettering does not hide a crossing', () => {
  for (const clipParent of [false, true]) {
    const line = new Line([-2, 0], [2, 0]);
    const plate = new Rectangle({ width: 5, height: 3, fill: '#000000', stroke: 'none' });
    const wrapper = new Group(plate);
    (clipParent ? wrapper : plate).clipBox = [-3, -2, -1.5, 2];
    const s = new Scene(new NullSink()).add(line, wrapper, label(false));
    assert.deepEqual(restingRouteProblems(s), ['A connector crosses "target"']);
  }
});

test('collinear cubic handles that overshoot their endpoints still count as painted route ink', () => {
  const line = new Line([-2, 0], [-1, 0]);
  line.subpaths = [new Float32Array([-2, 0, 3, 0, 3, 0, -1, 0])];
  line.touchPoints();
  const s = new Scene(new NullSink()).add(line, label(false));
  assert.deepEqual(restingRouteProblems(s), ['A connector crosses "target"']);
});

test('native curved arrows are checked at their curved ink rather than their endpoint chord', async () => {
  const { CurvedArrow } = await import('../src/index.ts');
  const arrow = new CurvedArrow([-2, 0], [2, 0]);
  const text = label(false).moveTo(arrow.arc.pointFromProportion(0.5));
  assert.deepEqual(restingRouteProblems(new Scene(new NullSink()).add(arrow, text)), ['A connector crosses "target"']);
});

test('stroke thickness counts when a route centreline narrowly misses the lettering', () => {
  const text = new Text('M', { fontSize: 0.4 }).moveTo([0, 0]);
  const ink = text.children[0]!.box()!;
  for (const width of [0.01, 0.2]) {
    const line = new Line([-2, ink[3] + 0.02], [2, ink[3] + 0.02], { strokeWidth: width });
    assert.equal(restingRouteProblems(new Scene(new NullSink()).add(line, text.copy())).length, width === 0.2 ? 1 : 0);
  }
});

test('clipped-away glyph ink is not reported as obstructed', () => {
  const text = new Text('MMMM', { fontSize: 0.4 }).moveTo([0, 0]);
  const last = text.children.at(-1)!.box()!;
  const x = (last[0] + last[2]) / 2;
  for (const glyph of text.children) glyph.clipBox = [-4, -4, -0.3, 4];
  const line = new Line([x, -1], [x, 1]);
  assert.deepEqual(restingRouteProblems(new Scene(new NullSink()).add(line, text)), []);
});

test('connector attachments may touch a glyph edge but may not run along it', () => {
  const t = new Text('M', { fontSize: 0.4 }).moveTo([0, 0]);
  const b = t.children[0]!.box()!;
  const y = (b[1] + b[3]) / 2;
  const attached = new Line([b[2] + 1, y], [b[2], y]);
  assert.deepEqual(restingRouteProblems(new Scene(new NullSink()).add(attached, t.copy())), []);
  const riding = new Line([b[0], b[3]], [b[2], b[3]]);
  assert.equal(restingRouteProblems(new Scene(new NullSink()).add(riding, t.copy())).length, 1);
});

test('internal path joints and joined line segments are not label attachments', () => {
  for (const split of [false, true]) {
    const a = new Line([1, 1], [0.5, 0], { strokeWidth: 0.1 });
    const b = new Line([0.5, 0], [1, -1], { strokeWidth: 0.1 });
    if (!split) { a.subpaths = [new Float32Array([...a.subpaths[0]!, ...b.subpaths[0]!.slice(2)])]; a.touchPoints(); }
    const s = new Scene(new NullSink()).add(...(split ? [a, b] : [a]), label(true));
    assert.deepEqual(restingRouteProblems(s), ['A connector crosses "target"'], split ? 'joined objects' : 'internal cubic joint');
  }
});

test('transparent or unresolved paints and ancestor opacity cannot provide an opaque mask', () => {
  for (const fill of ['transparent', '#0000', '#00000000', 'rgba(0,0,0,0)', 'url(#missing)', '#00000080', '#000000']) {
    for (const opacity of [0.96, 1]) {
      const line = new Line([-2, 0], [2, 0]);
      const plate = new Group(new Rectangle({ width: 2, height: 1, fill, stroke: 'none' })).setOpacity(opacity);
      const s = new Scene(new NullSink()).add(line, plate, label(false));
      assert.equal(restingRouteProblems(s).length, fill === '#000000' && opacity === 1 ? 0 : 1, `${fill}, ancestor opacity ${opacity}`);
    }
  }
});

test('known transparent route and glyph paint does not obstruct visible lettering', () => {
  for (const paint of ['transparent', '#0000', '#00000000', 'rgba(0,0,0,0)']) {
    const line = new Line([-2, 0], [2, 0], { stroke: paint });
    assert.deepEqual(restingRouteProblems(new Scene(new NullSink()).add(line, label(false))), [], `route ${paint}`);
    const text = label(true);
    text.children[0]!.setFill(paint);
    assert.deepEqual(restingRouteProblems(new Scene(new NullSink()).add(new Line([-2, 0], [2, 0]), text)), [], `glyph ${paint}`);
  }
  for (const paint of ['rgba(255,0,0)', 'hsla(0,100%,50%)', 'rgba(255,0,0,1)', 'rgb(255,0,0)']) {
    const line = new Line([-2, 0], [2, 0], { stroke: paint });
    assert.deepEqual(restingRouteProblems(new Scene(new NullSink()).add(line, label(false))), ['A connector crosses "target"'], `visible alias ${paint}`);
  }
});

test('imported VMobject connectors and copied diagrams obey the same crossing rule', async () => {
  const { Diagram } = await import('../explain/diagrams.ts');
  const { fixedSnapshot, square } = await import('./lib/random-snapshot.ts');
  const spec = { source: 'graph LR\nA --> B\nC[crossed]', style: 'nord' };
  const line = new Line([-2, 0.12], [2, 0.12], { stroke: '#000000' });
  const snapshot = fixedSnapshot(spec, [
    { id: 'A', role: 'node', kind: 'shape', shapes: [square(-2, { fill: '#ffffff', stroke: '#000000' })] },
    { id: 'B', role: 'node', kind: 'shape', shapes: [square(2, { fill: '#ffffff', stroke: '#000000' })] },
    { id: 'C', role: 'node', kind: 'text', shapes: [{ subpaths: [], closed: [], style: { fill: '#000000', stroke: 'none', strokeWidth: 0, strokeOpacity: 1, fillOpacity: 1, opacity: 1 }, text: 'crossed', fontSize: 0.3,
      textRun: { text: 'crossed', x: 0, y: 0, size: 30, matrix: [1, 0, 0, 1, 0, 0] } }] },
    { id: 'edge:A->B#0', role: 'edge', kind: 'connector', from: 'A', to: 'B', shapes: [{ subpaths: line.subpaths.map((a) => [...a]), closed: [...line.closed], style: { ...line.style } }] },
  ], { palette: { paper: '#ffffff', ink: '#000000', accent: '#ff0000', muted: '#777777' } });
  for (const copied of [false, true]) {
    const s = new Scene(new NullSink(), { skipUntil: Infinity });
    const d = new Diagram(s, spec, snapshot);
    await d.reveal('rest');
    if (copied) s.removeAll().add(d.root.copy());
    assert.deepEqual(restingRouteProblems(s), ['A connector crosses "crossed"']);
  }
});
