import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text } from '../src/index.ts';
import { NullSink, toSvgString, renderElements } from '../src/output.ts';
import { perf } from '../src/perf.ts';
import type { ElementRecord } from '../src/output.ts';
import { Fixture, explainers } from './lib/scenes.ts';
import { mobjectId } from '../src/mobject.ts';

// Caption holds are thousands of identical frames; the hold rule has its own test
Scene.captionWpm = Infinity;

// Render caches (path data, element records, merged glyph lines) are checked against a
// cache-free render: a copy of a mobject hits none of its original's caches. The scene
// renders every frame, so its caches see the whole history; every EVERY-th frame is compared
// (FULL=1: every third), plus the first eleven frames of short scenes. One output mode per run: the path cache holds one mode, so
// alternating modes would bypass it.
const EVERY = process.env.FULL ? 3 : 15;
// The camera comes along: an explainer that zooms (seasons) renders a viewBox of its own; so do its
// colours, whose paper is the SVG's background
const fresh = (scene: Scene): Scene => {
  const s = new Scene(new NullSink());
  s.frame = scene.frame.copy();
  s.colors = scene.colors;
  return s.add(...scene.mobjects.map((m) => m.copy()));
};
const absolute = (els: ElementRecord[]): string => els.map((e) => `${e.transform ?? ''}|${JSON.stringify(e.attrs)}|${e.text ?? ''}`).join('\n');

test('render caches are never stale: every explainer, both output modes, each sampled frame equals a cache-free render', async () => {
  for (const [name, Explainer] of await explainers()) {
    let i = 0, compared = 0;
    await new Explainer({ async frame(scene) {
      if (i++ % EVERY && i > 11) return void renderElements(scene);
      assert.equal(toSvgString(scene), toSvgString(fresh(scene)), `${name}: relative mode, frame ${i - 1}`);
      compared++;
    } }).run();
    let j = 0;
    await new Explainer({ async frame(scene) {
      const els = renderElements(scene, { relative: false });
      if (j++ % EVERY && j > 11) return;
      const got = absolute(els);
      assert.equal(got, absolute(renderElements(fresh(scene), { relative: false })), `${name}: absolute mode, frame ${j - 1}`);
      assert.ok(!got.includes('translate('), `${name}: absolute mode emits no translations`);
    } }).run();
    assert.ok(compared > 10, `${name}: ${compared} frames compared`);
  }
});

test('tracer: spans preserve values and exceptions, with exact nested self time', (t) => {
  let clock = 100;
  t.mock.method(performance, 'now', () => clock);
  try {
    perf.enable();
    const value = {};
    assert.equal(perf.span('outer', () => {
      clock += 3;
      assert.equal(perf.span('inner', () => { clock += 5; return value; }), value);
      clock += 2;
      return value;
    }), value);
    assert.deepEqual(perf.rows(), [
      { name: 'inner', calls: 1, total: 5, self: 5, max: 5 },
      { name: 'outer', calls: 1, total: 10, self: 5, max: 10 },
    ]);
    const failure = new Error('expected callback failure');
    assert.throws(() => perf.span('throws', () => { clock += 4; throw failure; }), (e) => e === failure);
    perf.span('after', () => { clock += 7; });
    assert.equal(perf.rows().find((r) => r.name === 'after')!.self, 7);
    assert.equal(perf.rows().find((r) => r.name === 'throws')!.total, 4);
  } finally { perf.disable().reset(); }
});

test('tracer: depth caps events while all spans aggregate; counters and reset remain observable', (t) => {
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  try {
    for (const timelineDepth of [0, 1, 2]) {
      perf.enable({ timelineDepth });
      perf.span('outer', () => { clock++; perf.span('middle', () => { clock++; perf.span('inner', () => { clock++; }); }); });
      assert.equal(perf.rows().length, 3);
      const trace = JSON.parse(perf.chromeTrace());
      assert.deepEqual(trace.traceEvents.map((e: { name: string }) => e.name), ['inner', 'middle', 'outer'].slice(3 - timelineDepth));
      perf.count('glyphs', 2); perf.count('glyphs');
      assert.match(perf.report(), /glyphs\s+3/);
      perf.reset();
      assert.deepEqual(perf.rows(), []);
      assert.deepEqual(JSON.parse(perf.chromeTrace()).traceEvents, []);
      assert.doesNotMatch(perf.report(), /glyphs/);
    }
    perf.disable();
    const value = {};
    assert.equal(perf.span('disabled', () => value), value);
    const failure = new Error('disabled callback failure');
    assert.throws(() => perf.span('disabled', () => { throw failure; }), (e) => e === failure);
    perf.count('disabled'); perf.begin('disabled')();
    assert.deepEqual(perf.rows(), []);
    assert.doesNotMatch(perf.report(), /disabled/);
    perf.enable();
    const end = perf.begin('async'); clock += 6; end();
    assert.deepEqual(perf.rows(), [{ name: 'async', calls: 1, total: 6, self: 6, max: 6 }]);
  } finally { perf.disable().reset(); }
});

test('DOM output merges same-styled glyph lines into one element, and splits during Write', async () => {
  let merged = 0, split = 0;
  await new Fixture({ async frame(scene) {
    const els = renderElements(scene, { relative: false });
    const ids = new Set(els.map((e) => e.id));
    for (const top of scene.mobjects) for (const m of top.family()) if (m instanceof Text && m.children.length > 1) {
      if (ids.has(mobjectId(m))) merged++; else if (m.children.some((c) => ids.has(mobjectId(c)))) split++;
    }
  } }).run();
  assert.ok(merged > 500, `merged lines: ${merged}`);
  assert.ok(split > 0, 'letter-by-letter Write falls back to per-glyph elements');
});

test('failed and stopped sinks close their trace span before the next caller', async (t) => {
  const { StopScene } = await import('../src/output.ts');
  let clock = 100;
  t.mock.method(performance, 'now', () => clock);
  try {
    for (const failure of [new Error('sink failed'), new StopScene()]) {
      perf.enable({ timelineDepth: 1 });
      const scene = new Scene({ async frame() { clock += 7; throw failure; } });
      await assert.rejects(scene.emitFrame(0), (error) => error === failure);
      perf.span('after', () => { clock += 3; });
      assert.deepEqual(perf.rows().find((r) => r.name === 'sink'), { name: 'sink', calls: 1, total: 7, self: 7, max: 7 });
      assert.deepEqual(perf.rows().find((r) => r.name === 'after'), { name: 'after', calls: 1, total: 3, self: 3, max: 3 });
      const events = JSON.parse(perf.chromeTrace()).traceEvents as { name: string; dur: number }[];
      assert.equal(events.find((e) => e.name === 'sink')!.dur, 7000, 'trace durations are microseconds');
      assert.ok(events.some((e) => e.name === 'after'), 'no failed span hides the next top-level event');
    }
  } finally { perf.disable().reset(); }
});
