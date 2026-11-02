import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { takeMissingGlyphs } from '../src/lettering.ts';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { contactSheet } from '../tools/lib/explain-shots.ts';
import { validateLetteringSnapshot } from '../tools/lib/lettering-validation.ts';
import { unpackLettering } from '../src/lettering-outlines.ts';
import type { LetteringSnapshot } from '../src/lettering-outlines.ts';
import type { Run, Segment, ShapedGlyph } from '../vendor/glyph.js';
import { fc, params } from './lib/pbt.ts';

const fixture = join(ROOT, 'test/lettering/arabic');
const sourceAt = async (folder: string) => {
  await writeFile(join(folder, 'scene.ts'), await readFile(join(fixture, 'scene.ts'), 'utf8'));
  // Unpacked, so a damaged outline is the glyph's own and not an index into the shared table
  const snapshot = unpackLettering(JSON.parse(await readFile(join(fixture, 'scene.lettering.json'), 'utf8')));
  return snapshot;
};

test('a fresh metadata fingerprint cannot hide damaged cached outline data', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lettering-audit-integrity-'));
  try {
    const snapshot = await sourceAt(folder);
    const run = Object.values(snapshot.runs).find((r: unknown) => (r as { glyphs: unknown[] }).glyphs.length) as { glyphs: { path: unknown[] }[] };
    run.glyphs[0]!.path = [{ tag: 'LineTo', x: 'broken', y: 0 }];
    // Even someone updating the checksum cannot bypass structural checks.
    snapshot.payloadHash = createHash('sha256').update(JSON.stringify({ ...snapshot, payloadHash: undefined })).digest('hex');
    await writeFile(join(folder, 'scene.lettering.json'), JSON.stringify(snapshot));
    await assert.rejects(collectProject(folder, { write: false }), /Invalid lettering snapshot outline/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('editing a contour without changing metadata is caught by the payload checksum', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lettering-audit-checksum-'));
  try {
    const snapshot = await sourceAt(folder);
    const run = Object.values(snapshot.runs).find((r: unknown) => (r as { glyphs: unknown[] }).glyphs.length) as { glyphs: { dx: number }[] };
    run.glyphs[0]!.dx += .1;
    await writeFile(join(folder, 'scene.lettering.json'), JSON.stringify(snapshot));
    await assert.rejects(collectProject(folder, { write: false }), /^Error: Invalid lettering snapshot payload checksum;/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('a cached snapshot rejects a glyph cluster one past the source even with fresh fingerprints and checksum', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lettering-audit-cluster-'));
  try {
    const snapshot = await sourceAt(folder);
    const file = join(folder, 'scene.lettering.json');
    await writeFile(file, JSON.stringify(snapshot));
    const control = await collectProject(folder, { write: false });
    assert.ok(control.outlineLettering, 'the unchanged cached snapshot is fresh');
    const [key, run] = Object.entries(snapshot.runs).find(([key, value]) =>
      [...JSON.parse(key)[1]].length > 0 && (value as { glyphs: unknown[] }).glyphs.length > 0,
    )! as [string, { glyphs: { cluster: number }[] }];
    run.glyphs[0]!.cluster = [...JSON.parse(key)[1]].length;
    snapshot.payloadHash = createHash('sha256').update(JSON.stringify({ ...snapshot, payloadHash: undefined })).digest('hex');
    await writeFile(file, JSON.stringify(snapshot));
    await assert.rejects(collectProject(folder, { write: false }), /^Error: Invalid lettering snapshot glyph;/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

for (const explicit of [false, true]) test(`numbered contact-sheet titles capture and replay the requested script (${explicit ? 'explicit' : 'ambient'})`, { skip: process.env.EXPLAIN_LETTERING !== '1' }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lettering-audit-sheet-'));
  try {
    await writeFile(join(folder, 'scene.ts'), `import{Scene,Text}from'rayner';import{stage}from'rayner/explain';export default class S extends Scene{static meta={id:'sheet',${explicit ? "textContext:'explicit'," : ''}lettering:{scripts:['Arab']}};async construct(){const s=stage(this,{heading:false});await this.step('one',{title:'السَّلَامُ عَلَيْكُمْ',caption:'Arabic'});await s.enter(${explicit ? 'this.text' : 'new Text'}('السَّلَامُ عَلَيْكُمْ'));}}`);
    const p = await collectProject(folder, { captureLettering: true, write: false });
    const key = JSON.stringify(['sans', '1. السَّلَامُ عَلَيْكُمْ', false]);
    assert.ok(p.outlineLettering?.runs[key]);
    takeMissingGlyphs();
    const output = join(folder, 'sheet.png');
    await contactSheet(p, output);
    assert.deepEqual([...takeMissingGlyphs()], [], 'the numbered title must not silently lose glyphs');
    assert.equal((await readFile(output)).subarray(1, 4).toString(), 'PNG');
  } finally { await rm(folder, { recursive: true, force: true }); }
});


// Schema proof is pure data: actual font decoding and capture stay at their
// existing pipeline owners. Hashes here are real digests, not owner receipts.
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type SchemaFont = 'math' | `${'sans' | 'mono'}${'' | '/bold' | '/italic' | '/bold-italic'}`;
function schemaSnapshot(text: string, font: SchemaFont, run: Run, display = false): LetteringSnapshot {
  const snapshot: LetteringSnapshot = {
    version: 1, sourceHash: digest('schema source'), builderHash: digest('schema builder'),
    request: {}, runs: { [JSON.stringify([font, text, display])]: run }, faces: {}, shaper: 'schema contract',
  };
  snapshot.payloadHash = digest(JSON.stringify(snapshot));
  return snapshot;
}
const finite = fc.double({ noNaN: true, noDefaultInfinity: true });
const positive = fc.double({ min: Number.MIN_VALUE, noNaN: true, noDefaultInfinity: true });
const segment: fc.Arbitrary<Segment> = fc.oneof(
  fc.record({ tag: fc.constantFrom('MoveTo' as const, 'LineTo' as const), x: finite, y: finite }),
  fc.record({ tag: fc.constant('QuadTo' as const), x1: finite, y1: finite, x: finite, y: finite }),
  fc.record({ tag: fc.constant('CubicTo' as const), x1: finite, y1: finite, x2: finite, y2: finite, x: finite, y: finite }),
  fc.constant({ tag: 'Close' as const }),
);
const validSchema = fc.record({
  // Binary strings retain lone surrogates, astral pairs and controls in the JS
  // string domain; the schema's indices count code points, not UTF-16 units.
  text: fc.string({ unit: 'binary' }), font: fc.constantFrom<SchemaFont>('sans', 'mono', 'math', 'sans/bold', 'sans/italic', 'sans/bold-italic', 'mono/bold', 'mono/italic', 'mono/bold-italic'),
  display: fc.boolean(), width: fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }),
  ascent: finite, descent: finite, s: positive,
}).chain(({ text, font, display, ...metrics }) => {
  const length = [...text].length;
  const glyph = fc.record({
    gid: fc.integer({ min: -1 }), cluster: fc.integer({ min: 0, max: Math.max(0, length - 1) }),
    x: finite, dx: finite, dy: finite, ax: finite, s: positive,
    path: fc.array(segment).map((path) => path.slice(0, 8)),
  });
  return (length ? fc.array(glyph) : fc.constant([])).map((glyphs) =>
    schemaSnapshot(text, font, { ...metrics, glyphs: glyphs.slice(0, 16) }, display));
});
const oneGlyph = (cluster = 0, gid = 1): ShapedGlyph => ({
  gid, cluster, x: 0, dx: 0, dy: 0, ax: 1, s: 1,
  path: [{ tag: 'MoveTo', x: 0, y: 0 }, { tag: 'LineTo', x: 1, y: 1 }],
});
const singleRun = (snapshot: LetteringSnapshot): Run => Object.values(snapshot.runs)[0]!;

test('serialized snapshot schema accepts finite runs with source-bound clusters across all families', () => {
  fc.assert(fc.property(validSchema, (snapshot) => validateLetteringSnapshot(snapshot)), params());
});

test('serialized snapshot schema rejects source indices outside code-point bounds', () => {
  fc.assert(fc.property(fc.string({ unit: 'binary' }), fc.nat(), fc.boolean(), (suffix, offset, below) => {
    const text = '𐐀' + suffix, length = [...text].length;
    const cluster = below ? -1 - offset : length + offset;
    const snapshot = schemaSnapshot(text, 'sans', { width: 1, ascent: 1, descent: 0, glyphs: [oneGlyph(cluster)] });
    assert.throws(() => validateLetteringSnapshot(snapshot), /^Error: Invalid lettering snapshot glyph;/);
  }), params());
});

test('serialized snapshot schema rejects non-finite run metrics before drawing', () => {
  fc.assert(fc.property(validSchema, fc.constantFrom('width', 'ascent', 'descent', 's'), fc.constantFrom(NaN, Infinity, -Infinity), (snapshot, key, value) => {
    singleRun(snapshot)[key] = value;
    assert.throws(() => validateLetteringSnapshot(snapshot), /^Error: Invalid lettering snapshot run metrics;/);
  }), params());
});

test('serialized snapshot schema rejects malformed outline commands', () => {
  const malformed = fc.oneof(
    fc.string().map((tag) => ({ tag: 'Unknown:' + tag })),
    fc.constant({ tag: 'LineTo', x: 0 }),
    fc.constant({ tag: 'QuadTo', x: 0, y: 0, x1: 1 }),
    fc.constant({ tag: 'CubicTo', x: 0, y: 0, x1: 1, y1: 1, x2: 1 }),
    fc.constantFrom(NaN, Infinity, -Infinity).map((x) => ({ tag: 'MoveTo', x, y: 0 })),
  );
  fc.assert(fc.property(malformed, (path) => {
    const glyph = oneGlyph();
    glyph.path = [path as Segment];
    const snapshot = schemaSnapshot('x', 'mono', { width: 1, ascent: 1, descent: 0, glyphs: [glyph] });
    assert.throws(() => validateLetteringSnapshot(snapshot), /^Error: Invalid lettering snapshot outline;/);
  }), params());
});

test('serialized snapshot schema rejects malformed run keys', () => {
  fc.assert(fc.property(fc.string({ unit: 'binary' }), fc.constantFrom('syntax', 'family', 'display', 'arity'), (text, kind) => {
    const key = kind === 'syntax' ? 'not-json:' + text : kind === 'family' ? JSON.stringify(['unknown', text, false])
      : kind === 'display' ? JSON.stringify(['sans', text, 'false']) : JSON.stringify(['sans', text]);
    const snapshot = schemaSnapshot('', 'sans', { width: 0, ascent: 1, descent: 0, glyphs: [] });
    snapshot.runs = { [key]: singleRun(snapshot) };
    assert.throws(() => validateLetteringSnapshot(snapshot), /^Error: Invalid lettering snapshot run key;/);
  }), params());
});

for (const { name, text, font, glyphs } of [
  { name: 'empty text', text: '', font: 'sans' as const, glyphs: [] },
  { name: 'astral source', text: '𐐀', font: 'sans' as const, glyphs: [oneGlyph(0)] },
  { name: 'control source', text: '\0\t\n\r', font: 'mono' as const, glyphs: [0, 1, 2, 3].map((cluster) => ({ ...oneGlyph(cluster, 0), path: [] })) },
  { name: 'combining source', text: 'e\u0301', font: 'sans' as const, glyphs: [oneGlyph(0), { ...oneGlyph(0), ax: 0 }] },
  { name: 'math rule', text: '\\frac{1}{2}', font: 'math' as const, glyphs: [oneGlyph(0, -1)] },
  { name: 'empty maths', text: '', font: 'math' as const, glyphs: [] },
]) test(`serialized snapshot source bounds preserve ${name}`, () => {
  const run = { width: text ? 1 : 0, ascent: 1, descent: 0, glyphs };
  validateLetteringSnapshot(schemaSnapshot(text, font, run));
  const bad = schemaSnapshot(text, font, { ...run, glyphs: [...glyphs, oneGlyph([...text].length)] });
  assert.throws(() => validateLetteringSnapshot(bad), /^Error: Invalid lettering snapshot glyph;/);
});

test('serialized snapshot source bounds handle one large run without recursive traversal', () => {
  const count = 100_000;
  const glyphs = Array.from({ length: count }, (_, i) => ({ ...oneGlyph(i), path: [] }));
  const snapshot = schemaSnapshot('𐐀'.repeat(count), 'mono', { width: count, ascent: 1, descent: 0, glyphs });
  validateLetteringSnapshot(snapshot);
  glyphs[count - 1]!.cluster = count;
  assert.throws(() => validateLetteringSnapshot(snapshot), /^Error: Invalid lettering snapshot glyph;/);
});
