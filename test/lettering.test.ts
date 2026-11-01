// Lettering on request (src/lettering.ts, tools/lib/explain-lettering.ts): an explainer pays only
// for the lettering it asks for. One that asks for nothing carries no lettering code and keeps its
// engine fingerprint; one that asks gets its letters, cut to what it draws; and a letter in a
// script nobody asked for still fails the build.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, cp, symlink, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProject, defaultVariant, ROOT, loadScene } from '../tools/lib/explain-project.ts';
import type { Project } from '../tools/lib/explain-project.ts';
import { buildExplainer } from '../tools/lib/explain-build.ts';
import { checkProject } from '../tools/lib/explain-check.ts';
import { SCRIPTS, letteringRequest, useProjectLettering } from '../tools/lib/explain-lettering.ts';
import type { LetteringFace } from '../tools/lib/explain-lettering.ts';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';
import { loadFonts, shaperFor, SnapshotSink, renderAt } from '../src/index.ts';
import { useLettering, takeMissingGlyphs } from '../src/lettering.ts';
import { takeMissingGlyphs as takeEmbeddedMissing } from '../src/index.ts';
import { loadFont } from '../vendor/glyph.js';
import { restingTime } from '../explain/trace.ts';

const folder = await mkdtemp(join(tmpdir(), 'rayner-lettering-'));
after(() => rm(folder, { recursive: true, force: true }));
const FIXTURE = join(ROOT, 'test/fixtures/lettering');
// The fixture's cut faces are pinned in scene.lettering.json: a build that needed fonttools
// would mean the pins are stale, so make any call to it fail.
process.env.PYFTSUBSET = join(folder, 'no-fonttools-here');

await loadFonts();
const embedded = { sans: shaperFor('sans'), mono: shaperFor('mono') };

/** What a build of `project` gives a reader: the page and its receipt. */
const built = (project: Project, name: string) => buildExplainer(project, join(folder, name + '.html'));

// Catalog policy is metadata; actual page/receipt assertions run in demos:build.
test('only the requested-face catalog example opts into lettering', async () => {
  for (const { id } of EXPLAINERS) {
    const { Scene } = await loadScene(join(ROOT, 'scenes/explainers', id));
    if (id === 'font-metrics') {
      assert.equal(Scene.meta?.lettering?.faces?.sans, 'eb-garamond');
      assert.deepEqual(Scene.meta?.lettering?.styles, ['bold', 'italic']);
    } else assert.equal(Scene.meta?.lettering, undefined, id);
  }
});

// Mutate real inputs in an isolated package, rather than repeating the producer's hash algorithm.
test('optional lettering code changes its engine fingerprint without changing an opt-out fingerprint', async () => {
  const copy = await mkdtemp(join(tmpdir(), 'rayner-hash-contract-'));
  try {
    for (const name of ['src', 'explain', 'integrations', 'tools', 'vendor'])
      await cp(join(ROOT, name), join(copy, name), { recursive: true });
    await cp(join(ROOT, 'package.json'), join(copy, 'package.json'));
    await symlink(join(ROOT, 'node_modules'), join(copy, 'node_modules'), 'dir');
    const plain = join(copy, 'plain.ts'), lettered = join(copy, 'lettered.ts');
    await writeFile(plain, `import{Scene}from'rayner';export default class Plain extends Scene{}`);
    await writeFile(lettered, `import{Scene}from'rayner';export default class Lettered extends Scene{static meta={lettering:{scripts:['Grek']}};}`);
    const run = promisify(execFile);
    const fingerprints = async () => JSON.parse((await run(process.execPath, ['--input-type=module', '-e',
      `import{loadScene}from${JSON.stringify(join(copy, 'tools/lib/explain-project.ts'))};console.log(JSON.stringify(await Promise.all(${JSON.stringify([plain, lettered])}.map(async file=>(await loadScene(file)).engineHash))));`
    ])).stdout) as [string, string];
    const before = await fingerprints();
    const optional = join(copy, 'src/lettering.ts');
    await writeFile(optional, (await readFile(optional, 'utf8')) + '\n// independently changed optional implementation\n');
    const after = await fingerprints();
    assert.equal(after[0], before[0], 'opt-out compatibility fingerprint stays stable');
    assert.notEqual(after[1], before[1], 'requested lettering counts its actual implementation');
  } finally { await rm(copy, { recursive: true, force: true }); }
});

test('a page that asks for nothing carries no lettering code, and building a lettered one first leaks nothing into it', async () => {
  const lettered = await collectProject(FIXTURE, { write: false });
  await built(lettered, 'lettered-first');
  assert.notEqual(shaperFor('sans'), embedded.sans, 'the lettered build selected its compatibility shapers');
  const plain = await collectProject(join(ROOT, 'scenes/explainers/seasons'), { write: false });
  // Collecting a plain project put the embedded shapers back, the very same functions
  assert.equal(shaperFor('sans'), embedded.sans);
  assert.equal(shaperFor('mono'), embedded.mono);
  const { html } = await built(plain, 'seasons');
  // Strings from src/lettering.ts survive minification; none may reach a page that asked for nothing
  assert.ok(!html.includes('lettering for sans') && !html.includes('lettering for mono'));
  for (const face of Object.values(lettered.lettering!.faces)) assert.ok(!html.includes(face.woff2));
});

test('useLettering with the faces in place, or none in place, does nothing', async () => {
  await useLettering(null);
  assert.equal(shaperFor('sans'), embedded.sans);
  const project = await collectProject(FIXTURE, { write: false });
  const lettered = shaperFor('sans');
  await useProjectLettering(project);
  assert.equal(shaperFor('sans'), lettered);
  await useLettering(null);
  await useLettering(null);
  assert.equal(shaperFor('sans'), embedded.sans);
});

// Fail closed: a script nobody asked for fails every command, as it did before lettering existed.
const scene = (meta: string, text: string) =>
  `import{Scene,Text}from'rayner';import{stage}from'rayner/explain';export default class L extends Scene{static meta={${meta}};async construct(){stage(this);await this.step('one',{title:'One'});this.add(new Text(${JSON.stringify(text)}));}}`;
async function collectSource(name: string, source: string) {
  const file = join(folder, name + '.ts');
  await writeFile(file, source);
  return collectProject(file, { write: false });
}

test('an explainer that asks for nothing still fails on a Greek letter, naming it', async () => {
  await assert.rejects(collectSource('plain-greek', scene(`id:'plain-greek'`, 'λόγος')), /cannot draw[\s\S]*λ \(U\+03BB\)/);
});

test('an explainer that asks for Greek still fails on a Cyrillic letter, naming it', async () => {
  await assert.rejects(
    collectSource('greek-cyrillic', scene(`id:'greek-cyrillic',lettering:{scripts:['Grek']}`, 'жук')),
    /cannot draw[\s\S]*ж \(U\+0436\)/,
  );
  // And after that failure the embedded faces are back for whatever builds next
  await collectProject(join(ROOT, 'scenes/explainers/seasons'), { write: false });
  shaperFor('sans')('ж', 1);
  assert.deepEqual([...takeMissingGlyphs()], [['ж', 'ж']]);
});

test('the legacy subset request parser rejects unsupported fields and scripts', () => {
  const ask = (lettering: unknown) => () => letteringRequest({ meta: { lettering } });
  assert.throws(ask({ scripts: ['Arab'] }), /unknown script "Arab".*Latn, Grek, Cyrl/);
  assert.throws(ask({ scripts: [] }), /non-empty scripts/);
  assert.throws(ask({ scripts: ['Grek', 'Grek'] }), /twice/);
  assert.throws(ask({ scripts: ['Grek'], math: true }), /math, which Rayner does not support yet/);
  assert.equal(letteringRequest({ meta: { id: 'x' } }), undefined);
  assert.deepEqual(letteringRequest({ meta: { lettering: { scripts: ['Cyrl', 'Latn'] } } }), { scripts: ['Cyrl', 'Latn'] });
});

// The fixture asks for Greek and draws it in Inter (a card's title and free text) and in
// JetBrains Mono (a card's values and code). JetBrains Mono has no ῶ,
// so code's ῶ comes from the Inter cut: the mono chain tries mono's cut, then sans's.
const greek = (s: string) => [...new Set([...s].filter((c) => SCRIPTS.Grek.some(([a, b]) => c.codePointAt(0)! >= a && c.codePointAt(0)! <= b)))];
const cps = (chars: string[]) => chars.map((c) => c.codePointAt(0)!).sort((a, b) => a - b);
const EXPECTED = {
  // Sans draws the title/free text and the mono face’s missing omega-with-circumflex.
  sans: cps(greek('Αλφάβητο Ελληνικά ῶ')),
  mono: cps(greek('λόγος φς αβγ')),
};

test('a lettered page embeds only the requested faces, cut to the letters it draws', async () => {
  const project = await collectProject(FIXTURE, { write: false });
  assert.deepEqual(project.lettering?.scripts, ['Grek']);
  const { html, receipt } = await built(project, 'lettered');
  const pinned = JSON.parse(await readFile(join(FIXTURE, 'scene.lettering.json'), 'utf8'));
  const sources = {
    sans: (await readFile(join(ROOT, 'vendor/lettering/inter.woff2'))).toString('base64'),
    mono: (await readFile(join(ROOT, 'vendor/lettering/jetbrains-mono.woff2'))).toString('base64'),
  };
  for (const family of ['sans', 'mono'] as const) {
    const face: LetteringFace = project.lettering!.faces[family]!;
    assert.equal(face.woff2, pinned.faces[family].woff2, `${family}: the pinned cut`);
    assert.ok(html.includes(face.woff2), `${family}: the page carries the cut`);
    assert.ok(!html.includes(sources[family]), `${family}: and not the whole source face`);
    // Every character the cut maps, read from its own cmap
    const font = await loadFont(Buffer.from(face.woff2, 'base64'));
    assert.equal(font.tag, 'Ok');
    if (font.tag !== 'Ok') return;
    const mapped: number[] = [];
    for (let cp = 0; cp < 0x30000; cp++) if (font.value.glyphOf(cp) !== 0) mapped.push(cp);
    assert.deepEqual(mapped, EXPECTED[family], `${family}: exactly the Greek it draws`);
    assert.deepEqual(face.codePoints, EXPECTED[family]);
  }
  // The size report, on the receipt of a lettered page only
  const report = receipt.lettering as { scripts: string[]; faces: Record<string, { characters: number; bytes: number }>; pageBytes: number };
  assert.deepEqual(report.scripts, ['Grek']);
  assert.equal(report.faces.sans!.characters, EXPECTED.sans.length);
  assert.equal(report.faces.mono!.characters, EXPECTED.mono.length);
  assert.equal(
    report.pageBytes,
    project.lettering!.faces.sans!.woff2.length + project.lettering!.faces.mono!.woff2.length,
  );
  assert.ok(report.pageBytes < 12_000, `${report.pageBytes} bytes for two dozen letters`);
});

test('a lettered explainer draws its Greek as outlines, and without its faces the same Greek is missing', async () => {
  const project = await collectProject(FIXTURE, { write: false });
  await useProjectLettering(project);
  takeMissingGlyphs();
  for (const [font, text] of [
    ['sans', 'Ελληνικά'],
    ['mono', 'αβγ'],
    ['mono', 'φῶς'],
  ] as const) {
    const run = shaperFor(font)(text, 1);
    assert.equal(run.glyphs.length, [...text].length, text);
    for (const g of run.glyphs) {
      assert.notEqual(g.gid, 0, `${font} ${text}`);
      assert.ok(g.path.length > 2, `${font} ${text}: an outline`);
    }
  }
  assert.deepEqual([...takeMissingGlyphs()], []);
  // The poster is the resting picture of the first step, drawn with those outlines
  const v = defaultVariant(project, { word: 'phos' });
  const step = v.trace.steps.find((s) => s.step === 'code')!;
  const sink = new SnapshotSink();
  await renderAt(v.Scene, restingTime(step, v.trace.fps), sink);
  const lettered = sink.svg;
  await useLettering(null);
  assert.ok(shaperFor('mono')('αβγ', 1).glyphs.every((g) => g.gid === 0));
  assert.deepEqual([...takeMissingGlyphs()], [['αβγ', 'αβγ']]);
  const bare = new SnapshotSink();
  await renderAt(v.Scene, restingTime(step, v.trace.fps), bare);
  assert.notEqual(bare.svg, lettered, 'the Greek outlines are what the lettering added');
});

test('a lettered explainer passes every check, its bare runtime included, and reports what its lettering weighs', async () => {
  const project = await collectProject(FIXTURE, { write: false });
  const report = await checkProject(project, join(folder, 'checks'));
  assert.deepEqual((report.lettering as { scripts: string[] }).scripts, ['Grek']);
  const plain = await checkProject(await collectSource('plain-check', scene(`id:'plain-check'`, 'Plain')), join(folder, 'plain-checks'));
  assert.equal('lettering' in plain, false);
});

test('a requested face records only the glyphs absent from every available face', async () => {
  const project = await collectProject(FIXTURE, { write: false });
  await useProjectLettering(project);
  takeMissingGlyphs();
  shaperFor('sans')('λж', 1);
  assert.deepEqual([...takeEmbeddedMissing()], [['λж', 'λж']], 'the engine names all the embedded faces lack');
  shaperFor('sans')('λж', 1);
  assert.deepEqual([...takeMissingGlyphs()], [['λж', 'ж']], 'lettering names only what no face has');
});
