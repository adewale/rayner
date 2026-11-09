import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Scene, Text, Group, VMobject } from '../src/index.ts';
import { NullSink, toSvgString } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import { Resvg } from '@resvg/resvg-js';
import { unpackLettering, withSceneLettering } from '../src/lettering-outlines.ts';
import { outlineText } from '../explain/diagram-text.ts';
import { diagramKey, snapshotResolver } from '../explain/diagram-snapshot.ts';
import type { DiagramSnapshot } from '../explain/diagram-snapshot.ts';
import { snapshotBuilder, naturalMeasurementIdentity } from '../integrations/agentic-mermaid/index.ts';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { fc, params } from './lib/pbt.ts';

test('natural lettering has a separate cache key and refuses unknown JavaScript modes', () => {
  fc.assert(fc.property(fc.string(), fc.string(), (source, style) => {
    const legacy = { source, style };
    assert.deepEqual(JSON.parse(diagramKey(legacy)), [source.replace(/\r\n/g, '\n').trim(), style || 'default']);
    assert.notEqual(diagramKey({ ...legacy, lettering: 'natural' }), diagramKey(legacy));
  }), params());
  for (const lettering of [null, '', false, 0, {}, new String('natural'), 'rtl', 'constructor'])
    assert.throws(() => diagramKey({ source: 'graph LR\nA', lettering } as never), /lettering must be 'natural'/);
});

test('natural imported glyphs retain their aspect and advance despite a fitted upstream width', async () => {
  await loadFonts();
  fc.assert(fc.property(
    fc.array(fc.constantFrom(...'WiMm01 .,-'), { minLength: 1, maxLength: 40 }).map((s) => s.join('')),
    fc.double({ min: 8, max: 80, noNaN: true }), fc.double({ min: 0.2, max: 5, noNaN: true }),
    (value, size, fittedRatio) => {
      const expected = new Text(value, { fontSize: size });
      const run = { text: value, size, x: 0, y: 0, matrix: [1, 0, 0, 1, 0, 0], natural: true as const,
        width: expected.advance() * fittedRatio };
      const imported = new Group(...outlineText(run, { fill: '#123456', stroke: 'none' }));
      const nativeInk = new Group(...expected.children);
      assert.ok(Math.abs(imported.width() - nativeInk.width() / 100) < 2e-6);
      assert.ok(Math.abs(imported.height() - nativeInk.height() / 100) < 2e-6);
    },
  ), params());
});

test('changing same-named font bytes or requested cuts changes the natural metric identity', () => {
  fc.assert(fc.property(fc.uint8Array({ minLength: 1, maxLength: 128 }), (bytes) => {
    const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
    const changed = Uint8Array.from(bytes); changed[0] = changed[0]! ^ 1;
    const options = { measurementHash: hash(bytes), styles: ['bold'] };
    const identity = naturalMeasurementIdentity(options);
    assert.notEqual(identity.id, naturalMeasurementIdentity({ ...options, measurementHash: hash(changed) }).id);
    assert.notEqual(identity.id, naturalMeasurementIdentity({ ...options, styles: ['italic'] }).id);
    assert.deepEqual(identity, naturalMeasurementIdentity(options));
  }), params());
});

test('natural baselines and anchors place actual glyph ink at the SVG coordinates', async () => {
  await loadFonts();
  fc.assert(fc.property(
    fc.constantFrom('sans' as const, 'mono' as const), fc.constantFrom('Test', 'Wi.01', 'lowercase'),
    fc.constantFrom('start', 'middle', 'end'),
    fc.constantFrom('alphabetic', 'middle', 'central', 'text-before-edge', 'text-after-edge'),
    fc.integer({ min: 8, max: 80 }), fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }),
    (font, value, anchor, baseline, size, x, y) => {
      const text = new Text(value, { font, fontSize: size });
      text.build(value, size, { fill: '#000000', stroke: 'none' });
      const xGlyph = new Text('x', { font, fontSize: 1 }).children[0]!;
      const offset = baseline === 'middle' ? xGlyph.height() * size / 2
        : baseline === 'central' ? (text.run.ascent - text.run.descent) / 2
        : baseline === 'text-before-edge' ? text.run.ascent
        : baseline === 'text-after-edge' ? -text.run.descent : 0;
      const shift = x - text.advance() * (anchor === 'middle' ? 0.5 : anchor === 'end' ? 1 : 0);
      const matrix = [1, 0.1, 0.2, 1, 2, -3];
      const actual = outlineText({ text: value, size, x, y, anchor, baseline, natural: true, font, matrix },
        { fill: '#000000', stroke: 'none' });
      assert.equal(actual.length, text.children.length);
      let points = 0;
      for (let i = 0; i < actual.length; i++) {
        const original = (text.children[i] as VMobject).subpaths;
        assert.equal(actual[i]!.subpaths.length, original.length);
        for (let j = 0; j < original.length; j++) for (let k = 0; k < original[j]!.length; k += 2) {
          const px = original[j]![k]! + shift, py = y + offset - original[j]![k + 1]!;
          const expectedX = (px + 0.2 * py + 2) / 100;
          const expectedY = -(0.1 * px + py - 3) / 100;
          assert.ok(Math.abs(actual[i]!.subpaths[j]![k]! - expectedX) < 3e-6);
          assert.ok(Math.abs(actual[i]!.subpaths[j]![k + 1]! - expectedY) < 3e-6);
          points++;
        }
      }
      assert.ok(points > 0, 'the placement assertion checks actual glyph points');
    },
  ), params());
});

const browser = process.env.EXPLAIN_BROWSER === '1';
test('real natural captures preserve explicit direction, and reject stale cached font metrics', {
  skip: !browser && 'set EXPLAIN_BROWSER=1 for actual Chromium capture',
}, async () => {
  const builder = await snapshotBuilder();
  try {
    for (const direction of ['LR', 'RL', 'TD', 'BT']) {
      const spec = { source: `graph ${direction}\nA[WWWWWWWWWW] -->|sends| B[iiiiiiiiii]`, lettering: 'natural' as const };
      const snapshot = await builder.diagram(spec);
      const center = (id: string) => {
        const shapes = snapshot.parts.find((p) => p.id === id)!.shapes.filter((s) => !s.textRun);
        assert.ok(shapes.length > 0);
        const group = new Group(...shapes.map((s) => {
          const path = new VMobject(s.style); path.subpaths = s.subpaths.map((p) => new Float32Array(p)); path.closed = s.closed; return path;
        }));
        const b = group.box()!; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      };
      const a = center('A'), b = center('B');
      assert.ok(direction === 'LR' ? a[0]! < b[0]! : direction === 'RL' ? a[0]! > b[0]!
        : direction === 'TD' ? a[1]! > b[1]! : a[1]! < b[1]!, direction);
      assert.equal(snapshot.findings.scope, 'source');
      assert.equal(snapshot.parts.flatMap((p) => p.shapes.filter((s) => s.textRun)).length, 3);
      await snapshotResolver({ [diagramKey(spec)]: snapshot }).diagram(spec);
      for (const field of ['font', 'width'] as const) for (const value of [undefined, null]) {
        const damaged = structuredClone(snapshot);
        const run = damaged.parts.flatMap((p) => p.shapes).find((s) => s.textRun)!.textRun!;
        if (value === undefined) delete run[field];
        else Object.assign(run, { [field]: value });
        await assert.rejects(snapshotResolver({ [diagramKey(spec)]: damaged }).diagram(spec), /scene\.snapshots: a diagram snapshot is invalid/);
      }
      const stale = await snapshotBuilder({ [diagramKey(spec)]: snapshot }, { measurementHash: 'changed source-font bytes' });
      try { await assert.rejects(stale.diagram(spec), /Stale natural diagram font metrics/); }
      finally { await stale.close(); }
    }
    await assert.rejects(builder.diagram({ source: 'graph LR\nA["<b>Bold</b>"]', lettering: 'natural' }), /styles.*'bold'/);
    const recovered = await builder.diagram({ source: 'graph LR\nA[Recovered]', lettering: 'natural' });
    assert.ok(recovered.parts.some((p) => p.id === 'A'), 'a refused style does not poison later independent captures');
    const imbalance = await builder.diagram({
      source: '---\nconfig:\n  sankey:\n    linkColor: source\n---\nsankey-beta\nA,B,10\nB,C,5',
      lettering: 'natural',
    });
    const warning = imbalance.findings.warnings.find((w) => w.code === 'FLOW_IMBALANCE');
    assert.ok(warning, 'natural layout retains source/data diagnostics');
    assert.equal(warning.node, 'B');
  } finally { await builder.close(); }
});

test('requested natural faces and rich cuts use independent HarfBuzz advances through capture and replay', {
  skip: !(browser && process.env.EXPLAIN_LETTERING === '1') && 'set EXPLAIN_BROWSER=1 EXPLAIN_LETTERING=1 for source-font capture/oracle',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-natural-fonts-'));
  try {
    const source = 'graph LR\nA[WWWWWWWWWWWW] -->|sends| B[iiiiiiiiiiii]\nB --> C["<b>Bold</b> <i>Italic</i>"]\nC --> D[Ink]\nD --> E[Paper]';
    const scene = `import{Scene}from'rayner';import{stage}from'rayner/explain';export default class Natural extends Scene{static meta={id:'natural',lettering:{faces:{sans:'eb-garamond'},styles:['bold','italic']}};async construct(){const s=stage(this,{heading:false});await this.step('one');await s.show({source:${JSON.stringify(source)},style:'pen-and-ink',lettering:'natural'});}}`;
    await writeFile(join(directory, 'scene.ts'), scene);
    const captured = await collectProject(directory, { refresh: true });
    const snapshot = Object.values(captured.store)[0]!;
    const runs = snapshot.parts.flatMap((p) => p.shapes.flatMap((s) => s.textRun ? [s.textRun] : []));
    assert.equal(runs.length, 8);
    const fonts = process.env.RAYNER_LETTERING_FONTS ?? join(ROOT, 'out/lettering-fonts');
    for (const run of runs.filter((r) => r.text.trim())) {
      const cut = run.italic ? '400-italic' : run.weight === 'bold' ? '700-normal' : '400-normal';
      const file = join(fonts, `fontsource-eb-garamond-5.3.0/package/files/eb-garamond-latin-${cut}.woff2`);
      const expected = JSON.parse(execFileSync(process.env.RAYNER_LETTERING_PYTHON ?? 'python3',
        [join(ROOT, 'test/lettering/oracle.py'), file, run.text], { encoding: 'utf8' })) as { ax: number }[];
      const advance = expected.reduce((n, glyph) => n + glyph.ax, 0) * run.size;
      assert.ok(Math.abs(run.width! - advance) < 0.001, `${run.text}: layout width ${run.width} vs independent source advance ${advance}`);
      await withSceneLettering(captured.Scene, async () => {
        const glyphs = new Group(...outlineText(run, { fill: '#000000', stroke: 'none' }));
        assert.ok(glyphs.width() > 0 && glyphs.height() > 0, 'actual outline ink is non-empty');
      });
    }
    assert.ok(runs.some((r) => r.weight === 'bold') && runs.some((r) => r.italic));
    assert.ok(Math.abs(runs.find((r) => r.text === 'Ink')!.width! - 1.337 * 13) < 0.001);
    assert.ok(Math.abs(runs.find((r) => r.text === 'Paper')!.width! - 2.144 * 13) < 0.001);
    // The actual imported outline is rasterized against an independent text
    // renderer using the original font bytes, not Rayner's glyph paths.
    const font = join(fonts, 'fontsource-eb-garamond-5.3.0/package/files/eb-garamond-latin-400-normal.woff2');
    const ttf = execFileSync(process.env.RAYNER_LETTERING_PYTHON ?? 'python3', ['-c',
      'import io,sys;from fontTools.ttLib import TTFont;f=TTFont(sys.argv[1]);f.flavor=None;o=io.BytesIO();f.save(o);sys.stdout.buffer.write(o.getvalue())', font]);
    const ttfFile = join(directory, 'source.ttf');
    await writeFile(ttfFile, ttf);
    await withSceneLettering(captured.Scene, async () => {
      const scene = new Scene(new NullSink());
      scene.add(...outlineText({ text: 'Ink', size: 80, x: 10, y: 100,
        natural: true, font: 'sans', width: 1.337 * 80, matrix: [1, 0, 0, 1, 0, 0] }, { fill: '#000000', stroke: 'none' }));
      const imported = toSvgString(scene).replace(/width="1280" height="720" viewBox="[^"]+"/,
        'width="200" height="120" viewBox="0 0 2000 1200"').replace(/<rect x="-8000"[^>]+\/>/, '');
      const reference = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 2000 1200"><text x="100" y="1000" font-size="800" font-family="EB Garamond" fill="#000000">Ink</text></svg>';
      const actual = new Resvg(imported, { font: { loadSystemFonts: false } }).render();
      const expected = new Resvg(reference, { font: { loadSystemFonts: false, fontFiles: [ttfFile] } }).render();
      const actualPixels = actual.pixels, expectedPixels = expected.pixels;
      assert.equal(actualPixels.length, expectedPixels.length);
      let difference = 0, painted = 0;
      for (let i = 0; i < actualPixels.length; i++) difference += Math.abs(actualPixels[i]! - expectedPixels[i]!);
      for (let i = 3; i < expectedPixels.length; i += 4) if (expectedPixels[i]! > 0) painted++;
      assert.ok(painted > 500, 'the independent source font really painted the word');
      assert.ok(difference / actualPixels.length < 0.5, `source-font raster mean channel error ${difference / actualPixels.length}`);
    });
    assert.ok(captured.outlineLettering!.fontInputs!['eb-garamond/bold']);
    const replay = await collectProject(directory, { write: false });
    assert.deepEqual(replay.store, captured.store);
    assert.deepEqual(replay.outlineLettering!.fontInputs, captured.outlineLettering!.fontInputs);
    // A same-named source face now refers to other bytes. The persisted metric
    // identity must reject reuse before the old node/route geometry is drawn.
    const file = join(directory, 'scene.lettering.json');
    const stored = unpackLettering(JSON.parse(await readFile(file, 'utf8')));
    stored.fontInputs!['eb-garamond'] = 'a'.repeat(64);
    await writeFile(file, JSON.stringify(stored));
    await assert.rejects(collectProject(directory, { write: false }), /Stale natural diagram font metrics/);
    // Poison the actual persisted diagram too: refreshing the source-font
    // metadata alone must not accidentally make damaged cached geometry reusable.
    const index = JSON.parse(await readFile(join(directory, 'scene.snapshots/index.json'), 'utf8')) as {
      diagrams: Record<string, string>;
    };
    const pinnedFile = join(directory, 'scene.snapshots', index.diagrams[diagramKey(snapshot.spec)]!);
    const pinned = JSON.parse(await readFile(pinnedFile, 'utf8')) as DiagramSnapshot;
    const different = pinned.textMeasurement!.id.endsWith('0'.repeat(64)) ? '1'.repeat(64) : '0'.repeat(64);
    pinned.textMeasurement!.id = 'rayner:shaped:' + different;
    const poisonedInk = pinned.parts.flatMap((p) => p.shapes).find((s) => s.textRun?.text === 'Ink')!.textRun!;
    poisonedInk.width = poisonedInk.width! + 1000;
    await writeFile(pinnedFile, JSON.stringify(pinned));
    const recaptured = await collectProject(directory, { captureLettering: true, write: false });
    const restored = Object.values(recaptured.store)[0]!;
    const restoredInk = restored.parts.flatMap((p) => p.shapes).find((s) => s.textRun?.text === 'Ink')!.textRun!;
    assert.deepEqual(restored.textMeasurement, snapshot.textMeasurement, 'capture restores the actual source-font profile');
    assert.ok(Math.abs(restoredInk.width! - 1.337 * 13) < 0.001,
      'capture restores the independent HarfBuzz advance instead of reusing poisoned geometry');
    assert.deepEqual(recaptured.store, captured.store, 'the prescribed snapshots capture repairs stale metric geometry without --refresh');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
