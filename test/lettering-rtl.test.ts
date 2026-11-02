// Right-to-left and bidi lettering, and morphs by cluster. Bidi is resolved once, at build time,
// with the shaping (tools/lettering.py); the page draws the stored runs. These tests hold
// stored runs to the Unicode Bidi Algorithm's visual order, the page to the paragraph's direction,
// and TransformMatchingText to pairing whole clusters.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Scene, NullSink, Text, MathTex, TransformMatchingText, loadFonts } from '../src/index.ts';
import { bindLettering, runKey, unpackLettering, rightToLeft } from '../src/lettering-outlines.ts';
import type { LetteringSnapshot } from '../src/lettering-outlines.ts';
import { collectProject, defaultVariant, ROOT } from '../tools/lib/explain-project.ts';
import { buildExplainer } from '../tools/lib/explain-build.ts';
import { pageSnapshot } from '../tools/lib/lettering.ts';

const folder = await mkdtemp(join(tmpdir(), 'rayner-lettering-rtl-'));
after(() => rm(folder, { recursive: true, force: true }));
const stored = async (id: string): Promise<LetteringSnapshot> =>
  unpackLettering(JSON.parse(await readFile(join(ROOT, 'test/lettering', id, 'scene.lettering.json'), 'utf8')));
/** A stored run's source clusters, left to right on the page. */
const visual = (s: LetteringSnapshot, text: string) =>
  [...s.runs[runKey('sans', text)]!.glyphs].sort((a, b) => a.x - b.x || a.cluster - b.cluster).map((g) => g.cluster);
const indexOf = (text: string, part: string) => [...text.slice(0, text.indexOf(part))].length;

test('a right-to-left paragraph runs right to left; a Latin word and a number in it keep their own order', async () => {
  const s = await stored('hebrew');
  // Pure Hebrew: the first letter is rightmost, and clusters fall from right to left
  const word = 'שָׁלוֹם עוֹלָם';
  const order = visual(s, word);
  assert.equal(order.at(-1), 0, 'the first letter is rightmost');
  assert.deepEqual(order, [...order].sort((a, b) => b - a), 'logical order runs right to left');
  // An RTL paragraph (first strong letter Hebrew): "Rayner" and "2.0" read left to right inside it,
  // "Rayner" sits left of the Hebrew before it, and the paragraph's first word is rightmost
  const mixed = 'גרסה 2.0 של Rayner (בטא)';
  const v = visual(s, mixed);
  const at = (part: string) => [...part].map((_, i) => v.indexOf(indexOf(mixed, part) + i));
  for (const part of ['Rayner', '2.0']) {
    const positions = at(part);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${part} reads left to right`);
  }
  assert.ok(Math.max(...at('Rayner')) < Math.min(...at('של')), 'Rayner is left of the Hebrew word before it');
  assert.ok(Math.min(...at('גרסה')) > Math.max(...at('של')), 'the first word is rightmost');
  // An LTR paragraph (first strong letter Latin) puts Rayner first, at the left
  const ltr = 'Rayner גרסה 2.0';
  const w = visual(s, ltr);
  assert.deepEqual(w.slice(0, 6), [0, 1, 2, 3, 4, 5]);
  // UAX #9 rule N1: the space and "2.0" after Hebrew join its right-to-left run, so 2.0 sits left of גרסה
  assert.ok(w.indexOf(indexOf(ltr, '2.0')) < w.indexOf(indexOf(ltr, 'גרסה')));
});

test('paragraph direction follows its first strong character, including bidi marks', () => {
  assert.equal(rightToLeft('שלום world'), true);
  assert.equal(rightToLeft('2026: שלום'), true, 'digits and punctuation are not strong');
  assert.equal(rightToLeft('Rayner גרסה'), false);
  // Bidi marks are strong characters too (UAX #9 P2), as python-bidi and the page's CSS take them
  assert.equal(rightToLeft('\u200fRayner גרסה'), true);
  assert.equal(rightToLeft('\u200eשלום'), false);
});

test('a page that asks for a right-to-left script sets each caption\'s direction from its text; others are as they were', async () => {
  const hebrew = await buildExplainer(await collectProject(join(ROOT, 'test/lettering/hebrew'), { write: false }), join(folder, 'hebrew.html'));
  assert.match(hebrew.html, /\.caption,[^{]*\{unicode-bidi:plaintext;text-align:start\}/);
  const devanagari = await buildExplainer(await collectProject(join(ROOT, 'test/lettering/devanagari'), { write: false }), join(folder, 'devanagari.html'));
  assert.doesNotMatch(devanagari.html, /unicode-bidi:plaintext/);
});

test('TransformMatchingText pairs whole clusters: a conjunct that replaces a letter fades, kept clusters morph', async () => {
  const project = await collectProject(join(ROOT, 'test/lettering/matching'), { write: false });
  const steps = defaultVariant(project).trace.steps;
  const match = (name: string) => {
    const e = steps.find((s) => s.step === name)!.evidence!.find((r) => r.kind === 'match')!;
    return { matched: e.matched, morphed: e.morphed, removed: e.removed, added: e.added };
  };
  // नम -> नमस्ते: न and म stay; स्ते (a conjunct cluster) arrives
  assert.deepEqual(match('grow'), { matched: 2, morphed: 0, removed: 0, added: 3 });
  // क -> क्ष: the cluster that starts with क is now a conjunct drawn by another glyph, so it fades
  // (pairing by the character at the cluster's start would have morphed क into the conjunct)
  assert.deepEqual(match('conjunct'), { matched: 0, morphed: 0, removed: 1, added: 1 });
  // سلم -> سلام: each letter keeps its cluster and one glyph, though its joining form changes
  assert.deepEqual(match('joining'), { matched: 3, morphed: 0, removed: 0, added: 1 });
});

test('cluster keys pair a match only when every Text in it has them; a Text built outside the scene pairs by character', async () => {
  const s = await stored('matching');
  await loadFonts();
  const outside = new Text('ab');
  let summary: ReturnType<TransformMatchingText['summary']> | undefined;
  class Mixed extends Scene {
    override async construct() {
      this.add(outside);
      const t = new TransformMatchingText(outside, new Text('abd'));
      await this.play(t);
      summary = t.summary();
    }
  }
  await new (bindLettering(Mixed, s))(new NullSink()).run();
  assert.deepEqual(summary, { matched: 2, morphed: 0, removed: 0, added: 1 });
});

test('a page leaves out the runs only the build draws, and every snapshot stores each outline once', async () => {
  const raw = JSON.parse(await readFile(join(ROOT, 'test/lettering/hebrew/scene.lettering.json'), 'utf8'));
  assert.ok(Array.isArray(raw.outlines), 'the committed snapshot is packed');
  assert.equal(new Set(raw.outlines.map((outline: unknown) => JSON.stringify(outline))).size, raw.outlines.length, 'the snapshot stores each distinct outline once');
  const s = await stored('hebrew');
  // Contact sheets draw numbered titles outside the authored scene. Pages omit those runs.
  for (const text of ['1. ניקוד', '2. כיוונים']) assert.ok(s.offPage!.includes(runKey('sans', text)), text);
  // What the stage draws stays: the heading and the words on stage
  for (const text of ['שָׁלוֹם עוֹלָם', 'Rayner גרסה 2.0']) assert.ok(!s.offPage!.includes(runKey('sans', text)), text);
  const page = await pageSnapshot(s);
  for (const key of s.offPage!) assert.equal(page.runs[key], undefined, key);
  assert.ok(Array.isArray(page.outlines));
  assert.equal(new Set(page.outlines.map((outline: unknown) => JSON.stringify(outline))).size, page.outlines.length, 'the page stores each distinct outline once');
  const unpacked = Buffer.byteLength(JSON.stringify(s.runs)), shipped = Buffer.byteLength(JSON.stringify(page));
  // Removing footer-only runs changes the fixture’s redundancy, so compare actual packed
  // page bytes with its unpacked runs without promising a fixture-specific compression ratio.
  assert.ok(shipped < unpacked, `the page carries ${shipped} bytes of the ${unpacked} the runs take unpacked`);
});

test('a packed snapshot unpacks only whole: every glyph names a stored outline and every outline is used', async () => {
  const raw = (): import('../src/lettering-outlines.ts').PackedLetteringSnapshot => JSON.parse(readFileSync(join(ROOT, 'test/lettering/hebrew/scene.lettering.json'), 'utf8'));
  // A shallow copy unpacks without touching the original, which stays packed
  const original = raw(), copy = unpackLettering({ ...original });
  assert.ok(Array.isArray(original.outlines) && copy.outlines === undefined);
  assert.deepEqual(unpackLettering(original), copy);
  const junk = raw();
  junk.outlines!.push([{ tag: 'MoveTo', x: 0, y: 0 }]);
  assert.throws(() => unpackLettering(junk), /Invalid lettering snapshot outlines/);
  const bad = raw();
  (Object.values(bad.runs)[0]!.glyphs[0] as unknown as { o: number }).o = 1e9;
  assert.throws(() => unpackLettering(bad), /Invalid lettering snapshot outlines/);
  // On disk, a damaged table names the file to rebuild
  const dir = await mkdtemp(join(folder, 'packed-'));
  await writeFile(join(dir, 'scene.ts'), await readFile(join(ROOT, 'test/lettering/hebrew/scene.ts'), 'utf8'));
  await writeFile(join(dir, 'scene.lettering.json'), JSON.stringify(junk));
  await assert.rejects(collectProject(dir, { write: false }), /Invalid lettering snapshot outlines; run rayner snapshots .*scene\.ts/);
  await writeFile(join(dir, 'scene.lettering.json'), 'null');
  await assert.rejects(collectProject(dir, { write: false }), /Missing or stale lettering snapshot/);
});

const capture = process.env.EXPLAIN_LETTERING === '1';
test('hebrew: stored glyph IDs, clusters, advances and offsets agree with independent HarfBuzz', { skip: !capture && 'set EXPLAIN_LETTERING=1 for the build-time oracle' }, async () => {
  const s = await stored('hebrew');
  const fonts = process.env.RAYNER_LETTERING_FONTS ?? join(ROOT, 'out/lettering-fonts');
  for (const text of ['שָׁלוֹם עוֹלָם', 'ניקוד']) {
    const expected = JSON.parse(execFileSync(process.env.RAYNER_LETTERING_PYTHON ?? 'python3', [join(ROOT, 'test/lettering/oracle.py'),
      join(fonts, 'fontsource-noto-sans-hebrew-5.3.0/package/files/noto-sans-hebrew-hebrew-400-normal.woff2'), text], { encoding: 'utf8' }));
    const actual = s.runs[runKey('sans', text)]!.glyphs;
    assert.equal(actual.length, expected.length, text);
    for (let i = 0; i < actual.length; i++) for (const k of ['gid', 'cluster', 'x', 'dx', 'dy', 'ax'] as const)
      assert.ok(Math.abs(actual[i]![k] - expected[i][k]) < 1e-12, `${text} ${i}.${k}: ${actual[i]![k]} vs ${expected[i][k]}`);
  }
});

test('capture of the Hebrew and matching fixtures is deterministic', { skip: !capture && 'set EXPLAIN_LETTERING=1 to capture' }, async () => {
  for (const id of ['hebrew', 'matching']) {
    const project = await collectProject(join(ROOT, 'test/lettering', id), { captureLettering: true, write: false });
    assert.deepEqual(project.outlineLettering, await stored(id), id);
  }
});

test('morphing maths reshapes nothing: no run for the TeX source is captured', { skip: !capture && 'set EXPLAIN_LETTERING=1 to capture' }, async () => {
  const dir = await mkdtemp(join(folder, 'math-'));
  await writeFile(join(dir, 'scene.ts'), `import{Scene,Math,TransformMatchingText}from'rayner';export default class L extends Scene{static meta={id:'m',lettering:{math:true,faces:{sans:'eb-garamond'}}};async construct(){await this.step('one');const a=new Math('a+b');this.add(a);await this.play(new TransformMatchingText(a,new Math('a+c')));}}`);
  const project = await collectProject(join(dir, 'scene.ts'), { captureLettering: true, write: false });
  const keys = Object.keys(project.outlineLettering!.runs).map((k) => JSON.parse(k) as [string, string, boolean]);
  assert.ok(keys.some(([f, t]) => f === 'math' && t === 'a+b'));
  assert.deepEqual(keys.filter(([f, t]) => f !== 'math' && (t === 'a+b' || t === 'a+c')), [], 'the formula source was not shaped as text');
});
