import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Scene, Text, DecimalNumber, shaperFor } from '../src/index.ts';
import { NullSink, SnapshotSink, renderFrame } from '../src/output.ts';
import { loadFonts, takeMissingGlyphs } from '../explain/testing.ts';
import { prepareLettering } from '../tools/lib/lettering.ts';
import { numericAlphabet, runKey, snapshotProvider } from '../src/lettering-outlines.ts';
import { loadFont, run } from '../vendor/glyph.js';

const enabled = process.env.EXPLAIN_LETTERING === '1';
const options = { skip: !enabled && 'set EXPLAIN_LETTERING=1 for optional font-tool pipeline regressions' };
const folder = await mkdtemp(join(tmpdir(), 'rayner-lettering-pipeline-'));
after(() => rm(folder, { recursive: true, force: true }));
const fontFolder = process.env.RAYNER_LETTERING_FONTS ?? new URL('../out/lettering-fonts', import.meta.url).pathname;

class Counter extends Scene {
  static meta = { id: 'audit-counter', lettering: { faces: { sans: 'inter' } } };
  override async construct() {
    await this.step('one');
    const value = new DecimalNumber(0);
    this.add(value);
    await this.play(value.animate.setValue(1000), { runTime: 1 });
  }
}

test('replacement subsets retain the formatted numeric alphabet and finished providers replay intermediate values', options, async () => {
  const file = join(folder, 'counter.ts');
  const prepared = await prepareLettering(Counter, file, true, true);
  assert.ok(prepared);
  await new prepared.Scene(new NullSink()).run();
  await prepared.finish();
  const cached = await prepareLettering(Counter, file, false);
  assert.deepEqual(cached?.snapshot, prepared.snapshot, 'the just-persisted capture is fresh and readable');
  const subset = await loadFont(Buffer.from(prepared.snapshot.faces.inter!.data, 'base64'));
  assert.equal(subset.tag, 'Ok');
  if (subset.tag !== 'Ok') return;
  const full = await loadFont(await readFile(join(fontFolder, 'inter-ui-4.1.1/package/web/Inter-Regular.woff2')));
  assert.equal(full.tag, 'Ok');
  if (full.tag !== 'Ok') return;
  for (const ch of numericAlphabet) if (full.value.glyphOf(ch.codePointAt(0)!) !== 0)
    assert.notEqual(subset.value.glyphOf(ch.codePointAt(0)!), 0, `numeric subset is missing ${JSON.stringify(ch)}`);
  assert.equal(prepared.snapshot.runs[runKey('sans', '500')], undefined, 'the intermediate value was not stored as a caption');
  await renderFrame(prepared.Scene, 15, new SnapshotSink());
  await new prepared.Scene(new NullSink(), { fps: 7 }).run();
  const replay = snapshotProvider(prepared.snapshot);
  await replay.prepare?.();
  assert.throws(() => replay.shape('sans', 'An unseen caption', 1, () => { throw new Error('unexpected fallback'); }), /no run/);
});

test('simple-script requests respect both an explicit face and the original mono face', options, async () => {
  class Faces extends Scene {
    static meta = { id: 'audit-faces', lettering: { faces: { sans: 'eb-garamond' }, scripts: ['Latn'] } };
    override async construct() {
      await this.step('one');
      this.add(new Text('MMMM'), new Text('MMMM', { font: 'mono' }));
    }
  }
  await loadFonts();
  const mono = shaperFor('mono')('MMMM', 1);
  const prepared = await prepareLettering(Faces, join(folder, 'faces.ts'), true, false);
  assert.ok(prepared);
  await new prepared.Scene(new NullSink()).run();
  const font = await loadFont(await readFile(join(fontFolder, 'fontsource-eb-garamond-5.3.0/package/files/eb-garamond-latin-400-normal.woff2')));
  assert.equal(font.tag, 'Ok');
  if (font.tag !== 'Ok') return;
  const expected = run(font.value, 'garamond', 'MMMM', 1);
  assert.equal(expected.tag, 'Ok');
  if (expected.tag !== 'Ok') return;
  assert.ok(Math.abs(prepared.snapshot.runs[runKey('sans', 'MMMM')]!.width - expected.value.width) < 1e-12, 'the requested Garamond face wins over script Inter');
  assert.ok(Math.abs(prepared.snapshot.runs[runKey('mono', 'MMMM')]!.width - mono.width) < 1e-12, 'the existing mono face wins where it covers Latin');
});

test('requesting a replacement preserves existing Arabic-Indic numeral fallback coverage', options, async () => {
  class Numerals extends Scene {
    static meta = { id: 'audit-numerals', lettering: { faces: { sans: 'inter' } } };
    override async construct() { await this.step('one'); this.add(new Text('١')); }
  }
  const prepared = await prepareLettering(Numerals, join(folder, 'numerals.ts'), true, false);
  assert.ok(prepared);
  takeMissingGlyphs();
  await new prepared.Scene(new NullSink()).run();
  assert.deepEqual([...takeMissingGlyphs()], []);
  assert.ok(prepared.snapshot.runs[runKey('sans', '١')]!.glyphs.every((g) => g.gid !== 0));
});
