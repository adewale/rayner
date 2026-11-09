// WOFF2 to SFNT at build time (tools/lib/woff2.ts): every face a page can carry loads in the
// SFNT-only shaper and shapes exactly as its WOFF2 form does in the full one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadFont, run } from '../vendor/glyph.js';
import type { Font } from '../vendor/glyph.js';
import { sfntBase64, woff2ToSfnt } from '../tools/lib/woff2.ts';
import { ROOT } from '../tools/lib/explain-project.ts';

/** Every WOFF2 face in the repository: the lettering sources and each committed snapshot's cuts. */
function faces(): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  for (const name of readdirSync(join(ROOT, 'vendor/lettering')).filter((f) => f.endsWith('.woff2')))
    out.push([name, readFileSync(join(ROOT, 'vendor/lettering', name))]);
  const snapshots = ['scenes/explainers/font-metrics', 'scenes/explainers/feature-tour', 'test/fixtures/lettering',
    ...readdirSync(join(ROOT, 'test/lettering')).map((d) => `test/lettering/${d}`)];
  for (const folder of snapshots) {
    let json: { faces?: Record<string, { data?: string; woff2?: string }> };
    try { json = JSON.parse(readFileSync(join(ROOT, folder, 'scene.lettering.json'), 'utf8')); } catch { continue; }
    for (const [name, face] of Object.entries(json.faces ?? {})) out.push([`${folder}: ${name}`, Buffer.from((face.data ?? face.woff2)!, 'base64')]);
  }
  return out;
}
const loaded = async (bytes: Uint8Array): Promise<Font> => {
  const r = await loadFont(bytes);
  assert.equal(r.tag, 'Ok', JSON.stringify(r.tag === 'Ok' ? '' : r.error));
  return (r as { value: Font }).value;
};

test('every WOFF2 face converts to an SFNT that maps and shapes every character alike', async () => {
  const all = faces();
  assert.ok(all.length >= 15, `${all.length} faces`);
  for (const [name, bytes] of all) {
    const sfnt = woff2ToSfnt(bytes);
    assert.notEqual(Buffer.from(sfnt).toString('latin1', 0, 4), 'wOF2', name);
    const a = await loaded(bytes), b = await loaded(sfnt);
    const mapped: number[] = [];
    for (let cp = 0; cp < 0x30000; cp++) {
      const g = a.glyphOf(cp);
      assert.equal(b.glyphOf(cp), g, `${name}: U+${cp.toString(16)}`);
      if (g) mapped.push(cp);
    }
    // Each mapped character with two others, so kerning, ligatures and marks are exercised too.
    for (let i = 0; i < mapped.length; i++) {
      const text = String.fromCodePoint(mapped[i]!, mapped[(i * 7 + 3) % mapped.length]!, mapped[(i * 13 + 5) % mapped.length]!);
      assert.deepEqual(run(b, 'k', text, 1), run(a, 'k', text, 1), `${name}: ${JSON.stringify(text)}`);
    }
  }
});

test('the SFNT-only page shaper reads a converted face, and refuses the WOFF2 one', async () => {
  const { build } = await import('esbuild');
  const { browserFonts } = await import('../tools/lib/explain-browser-fonts.ts');
  const result = await build({
    stdin: { contents: `export{loadFont,run}from ${JSON.stringify(join(ROOT, 'vendor/glyph.js'))}`, resolveDir: ROOT },
    bundle: true, format: 'esm', write: false, plugins: [browserFonts()],
  });
  const page = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0]!.text).toString('base64'));
  const woff2 = readFileSync(join(ROOT, 'vendor/lettering/jetbrains-mono.woff2'));
  const refused = await page.loadFont(woff2).then((r: { tag: string }) => r.tag, () => 'threw');
  assert.notEqual(refused, 'Ok', 'the page has no Brotli decoder');
  const sfnt = await page.loadFont(woff2ToSfnt(woff2));
  assert.equal(sfnt.tag, 'Ok');
  assert.deepEqual(page.run(sfnt.value, 'k', 'let x = 1;', 1), run(await loaded(woff2), 'k', 'let x = 1;', 1));
});

test('conversion refuses what is not WOFF2, and leaves an SFNT face as it is', () => {
  const sfnt = Buffer.from(woff2ToSfnt(readFileSync(join(ROOT, 'vendor/lettering/jetbrains-mono.woff2')))).toString('base64');
  assert.equal(sfntBase64(sfnt), sfnt);
  assert.throws(() => woff2ToSfnt(new Uint8Array(64)), /^Error: woff2ToSfnt\(\): the face is not a WOFF2 font/);
  const truncated = readFileSync(join(ROOT, 'vendor/lettering/jetbrains-mono.woff2')).subarray(0, 200);
  assert.throws(() => woff2ToSfnt(truncated), /woff2ToSfnt\(\): the face is not a WOFF2 font it can convert/);
});
