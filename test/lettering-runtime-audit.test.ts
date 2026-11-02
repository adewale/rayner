import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  Scene, Text, Code, DecimalNumber, Transform, NullSink, SnapshotSink, renderAt,
  loadFonts, shaperFor,
} from '../src/index.ts';
import { SANS, MONO } from '../src/font-data.ts';
import {
  bindLettering, withSceneLettering, snapshotProvider, runKey,
} from '../src/lettering-outlines.ts';
import type { LetteringProvider, LetteringSnapshot } from '../src/lettering-outlines.ts';
import { loadFont } from '../vendor/glyph.js';
import type { Run } from '../vendor/glyph.js';
import { shapeChain } from '../src/fonts.ts';

function snapshot(request: LetteringSnapshot['request'], runs: Record<string, Run>): LetteringSnapshot {
  return { version: 1, sourceHash: '', builderHash: '', request, runs, faces: {}, shaper: 'runtime-audit' };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Nested font lease did not settle')), 1500);
    })]);
  } finally { clearTimeout(timer); }
}

test('face requests replay counters at arbitrary FPS and preserve known numeric wrappers', async () => {
  await loadFonts();
  const mono = shaperFor('mono');
  const strings = ['count: 0.0 s of 10', 'count: 10.0 s of 10'];
  const data = snapshot({ faces: { sans: 'audit-mono' } }, Object.fromEntries(strings.map((text) => [runKey('sans', text), mono(text, 1)])));
  data.faces['audit-mono'] = { hash: '', data: MONO, license: '' };
  const before = JSON.stringify(data);
  const seen = new Set<string>();
  class Counter extends Scene {
    override async construct() {
      const n = new DecimalNumber(0, { decimals: 1, prefix: 'count: ', suffix: ' s of 10', fontSize: .5 });
      this.add(n);
      await this.play(new Transform(n, new DecimalNumber(10, { decimals: 1, prefix: 'count: ', suffix: ' s of 10', fontSize: .5 })), { runTime: 1 });
    }
  }
  const Bound = bindLettering(Counter, data);
  for (const fps of [7, 11, 30]) {
    await new Bound({ async frame(scene) {
      const n = scene.mobjects[0] as DecimalNumber | undefined;
      if (!n) return;
      seen.add(n.text);
      assert.ok(Math.abs(n.run.width - mono(n.text, n.run.fontSize).width) < 1e-7, 'runtime numerals retain the requested mono face');
    } }, { fps }).run();
  }
  await renderAt(Bound, .5, new SnapshotSink());
  assert.ok(seen.size > 15, 'intermediate values were not captured as endpoint runs');
  assert.equal(JSON.stringify(data), before, 'private numeric caches do not change snapshots or their hashes');
  const provider = snapshotProvider(data);
  await provider.prepare?.();
  assert.throws(() => provider.shape('sans', 'uncaptured caption', 1, mono), /no run/);
  assert.throws(() => provider.shape('sans', 'count: خمسة s', 1, mono), /no run/);
  assert.throws(() => provider.shape('sans', 'different prefix: 5.0 s', 1, mono), /no run/);
});

test('Greek numeric wrappers work with replaced, implicit and partially replaced families', async () => {
  const greekBytes = await readFile(new URL('../vendor/lettering/inter.woff2', import.meta.url));
  const [sans, mono, greek] = await Promise.all([loadFont(Buffer.from(SANS, 'base64')), loadFont(Buffer.from(MONO, 'base64')), loadFont(greekBytes)]);
  assert.equal(sans.tag, 'Ok'); assert.equal(mono.tag, 'Ok'); assert.equal(greek.tag, 'Ok');
  if (sans.tag !== 'Ok' || mono.tag !== 'Ok' || greek.tag !== 'Ok') return;
  for (const mode of ['replaced-sans', 'implicit-sans', 'implicit-mono'] as const) {
    const font = mode === 'implicit-mono' ? 'mono' : 'sans';
    const chain = [mode === 'implicit-sans' ? sans.value : mono.value, greek.value];
    const data = snapshot({ ...(mode === 'implicit-sans' ? {} : { faces: { sans: 'audit-mono' } }), scripts: ['Grek'], math: true },
      Object.fromEntries(['λόγος 0', 'λόγος 7'].map((text) => [runKey(font, text), shapeChain(chain, font, text, 1)])));
    if (mode !== 'implicit-sans') data.faces['audit-mono'] = { hash: '', data: MONO, license: '' };
    data.faces.inter = { hash: '', data: greekBytes.toString('base64'), license: '' };
    const seen = new Set<string>();
    class Counter extends Scene {
      override async construct() {
        const n = new DecimalNumber(0, { prefix: 'λόγος ', font }); this.add(n);
        await this.play(new Transform(n, new DecimalNumber(7, { prefix: 'λόγος ', font })), { runTime: 1 });
      }
    }
    await new (bindLettering(Counter, data))({ async frame(scene) {
      const n = scene.mobjects[0] as DecimalNumber | undefined;
      if (!n) return;
      seen.add(n.text);
      assert.ok(Math.abs(n.run.width - shapeChain(chain, font, n.text, n.run.fontSize).width) < 1e-7, mode);
    } }, { fps: 11 }).run();
    assert.ok(seen.has('λόγος 3'), mode);
  }
});

function mixedSnapshot(): { text: string; data: LetteringSnapshot } {
  const text = 'ab אב cd';
  const logical = [0, 1, 2, 4, 3, 5, 6, 7];
  const run: Run = { width: 8, ascent: .8, descent: .2, s: 1, glyphs: logical.map((cluster, x) => ({
    gid: cluster + 1, cluster, x, dx: 0, dy: 0, ax: 1, s: 1,
    path: text[cluster] === ' ' ? [] : [
      { tag: 'MoveTo', x: .1, y: 0 }, { tag: 'LineTo', x: .9, y: 0 },
      { tag: 'LineTo', x: .9, y: .7 }, { tag: 'LineTo', x: .1, y: .7 }, { tag: 'Close' },
    ],
  })) };
  return { text, data: snapshot({ scripts: ['Hebr'] }, { [runKey('mono', text)]: run }) };
}

test('RTL/mixed Code token boxes use visual advance cells, including after the lease and on copies', async () => {
  const { text, data } = mixedSnapshot();
  let code!: Code;
  class Example extends Scene {
    override async construct() { code = new Code([text], { fontSize: 1 }); this.add(code); }
  }
  await new (bindLettering(Example, data))(new NullSink()).run();
  const left = code.lines[0]!.frameBox[0]!;
  assert.deepEqual(code.span(0, 3, 4).box().slice(0, 3).filter((_, i) => i !== 1), [left + 4, left + 5]);
  assert.equal(code.span(0, 4, 5).box()[0], left + 3);
  assert.equal(code.span(0, 4, 5).box()[2], left + 4);
  assert.equal(code.span(0, 2, 3).box()[2] - code.span(0, 2, 3).box()[0], 1, 'spaces have advance cells');
  assert.equal(code.span(0, 3, 3).box()[0], left + 5, 'RTL start caret');
  assert.equal(code.span(0, 4, 4).box()[0], left + 4, 'RTL interior caret');
  const copy = code.copy();
  assert.deepEqual(copy.span(0, 3, 4).box(), code.span(0, 3, 4).box());
  assert.equal(code.span(0, 0, 1).box()[2] - code.span(0, 0, 1).box()[0], 1, 'LTR part of mixed text stays one cell');
});

test('ordinary LTR spans keep their geometry after explicitly installing the optional adapter', async () => {
  await loadFonts();
  class Install extends Scene { override async construct() {} }
  const mono = shaperFor('mono');
  const provider: LetteringProvider = { shape: (_, text, size) => mono(text, size), math: () => { throw new Error('unused'); } };
  await new (bindLettering(Install, provider))(new NullSink()).run();
  const code = new Code(['abc def'], { fontSize: .5 });
  const line = code.lines[0]!, width = mono('abc', .5).width;
  const span = code.span(0, 0, 3).box();
  assert.ok(Math.abs(span[0] - line.frameBox[0]!) < 1e-6);
  assert.ok(Math.abs((span[2] - span[0]) - width) < 1e-6);
});

test('an empty range inside an RTL base/mark cluster remains a zero-width caret', async () => {
  const text = 'אְב';
  const run: Run = { width: 2, ascent: .8, descent: .2, s: 1, glyphs: [2, 0].map((cluster, x) => ({
    gid: cluster + 1, cluster, x, dx: 0, dy: 0, ax: 1, s: 1,
    path: [{ tag: 'MoveTo', x: 0, y: 0 }, { tag: 'LineTo', x: 1, y: .5 }],
  })) };
  run.glyphs.push({ gid: 9, cluster: 0, x: 1, dx: 0, dy: 1, ax: 0, s: 1,
    path: [{ tag: 'MoveTo', x: -.5, y: 2 }, { tag: 'LineTo', x: .2, y: 3 }],
  });
  let code!: Code;
  class Example extends Scene { override async construct() { code = new Code([text]); this.add(code); } }
  await new (bindLettering(Example, snapshot({ scripts: ['Hebr'] }, { [runKey('mono', text)]: run })))(new NullSink()).run();
  const caret = code.span(0, 1, 1).box();
  assert.equal(caret[2] - caret[0], 0);
  const mark = code.lines[0]!.children.find((g) => g.box()![3] > code.lines[0]!.frameBox[3]!)!;
  assert.ok(code.span(0, 1, 2).box()[3] >= mark.box()![3], 'a nonempty partial cluster includes its overhanging mark ink');
});

test('same-provider nested runs settle and delayed ordinary runs keep embedded fonts', async () => {
  await loadFonts();
  const normal = shaperFor('sans'), mono = shaperFor('mono');
  const provider: LetteringProvider = { shape: (_, text, size) => mono(text, size), math: () => { throw new Error('unused'); } };
  class Lettered extends Scene { override async construct() { this.add(new Text('WWW')); } }
  const Bound = bindLettering(Lettered, provider);
  const nested = await bounded(withSceneLettering(Bound, () => new Bound(new NullSink()).run()));
  assert.ok(Math.abs((nested.mobjects[0] as Text).run.width - mono('WWW', .4).width) < 1e-8);

  const started = deferred(), finish = deferred();
  class Slow extends Scene {
    override async construct() { started.resolve(); await finish.promise; this.add(new Text('WWW')); }
  }
  class Ordinary extends Scene { override async construct() { this.add(new Text('WWW')); } }
  const slow = new (bindLettering(Slow, provider))(new NullSink()).run();
  await started.promise;
  const ordinary = new Ordinary(new NullSink()).run();
  finish.resolve();
  const [, plain] = await bounded(Promise.all([slow, ordinary]));
  assert.ok(Math.abs((plain.mobjects[0] as Text).run.width - normal('WWW', .4).width) < 1e-8);
});

test('the compatibility context waits for overlapping same-provider tasks before admitting another scene', async () => {
  await loadFonts();
  const mono = shaperFor('mono');
  const provider: LetteringProvider = { shape: (_, text, size) => mono(text, size), math: () => { throw new Error('unused'); } };
  const started = deferred(), firstEnd = deferred(), secondEnd = deferred();
  class First extends Scene { override async construct() { started.resolve(); await firstEnd.promise; } }
  class Second extends Scene { override async construct() { await secondEnd.promise; this.add(new Text('WWW')); } }
  const first = new (bindLettering(First, provider))(new NullSink()).run();
  await started.promise;
  const second = new (bindLettering(Second, provider))(new NullSink()).run();
  let firstSettled = false;
  void first.then(() => { firstSettled = true; });
  firstEnd.resolve();
  // First has no I/O left: drain a whole turn while Second deliberately holds
  // the shared provider. The lease must not settle or restore embedded fonts.
  await nextTurn();
  const settledBeforeSecond = firstSettled;
  secondEnd.resolve();
  const [, done] = await bounded(Promise.all([first, second]));
  assert.equal(settledBeforeSecond, false, 'the first lease waits for its overlapping task');
  assert.equal(firstSettled, true);
  assert.ok(Math.abs((done.mobjects[0] as Text).run.width - mono('WWW', .4).width) < 1e-8);
});
