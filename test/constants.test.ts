// Constants that more than one module needs have one source: the stage's frame and units in
// src/units.ts, the page's own query keys in explain/page-query.ts, the numeric alphabet beside the
// test it answers for. A copy elsewhere would drift the day one of them changes, so the source is
// searched for the copies this repository once carried.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { FRAME, STAGE_BOX, UNITS } from '../src/units.ts';
import { PAGE_QUERY } from '../explain/page-query.ts';
import { isNumericText, numericAlphabet } from '../src/lettering-outlines.ts';

const ROOT = resolve(import.meta.dirname, '..');
const LAYERS = ['src', 'explain', 'integrations', 'app', 'tools'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'vendor') return [];
    return statSync(path).isDirectory() ? sources(path) : name.endsWith('.ts') ? [path] : [];
  });
}
const files = LAYERS.flatMap((layer) => sources(join(ROOT, layer))).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }));

/** Lines that copy a constant instead of importing it, with the module that owns it. */
const COPIES: { owner: string; pattern: RegExp; what: string }[] = [
  { owner: 'src/units.ts', pattern: /\{\s*w:\s*16,\s*h:\s*9\s*\}|width:\s*16,\s*height:\s*9\b|\(\w+\[2\]\s*-\s*\w+\[0\]\)\s*\/\s*16\b|\b16\s*\/\s*\(|\b9\s*\/\s*\(|\/\s*16,\s*h\s*\/\s*9\b|\*\s*9\)?\s*\/\s*16\b/, what: 'the 16 × 9 frame' },
  { owner: 'src/units.ts', pattern: /\bconst\s+\w+\s*=\s*1000\s*;/, what: 'the user units per scene unit' },
  { owner: 'explain/page-query.ts', pattern: /(?:get|set|has|delete)\('(?:step|sent|parentOrigin|theme)'|[?&](?:step|sent|parentOrigin|theme)=/, what: 'a page query key' },
  { owner: 'explain/machine.ts', pattern: /runTime:\s*1\s*\/\s*30\b/, what: 'a frame time that ignores the scene’s fps' },
];

test('each shared constant is written once, in the module that owns it', () => {
  const found: string[] = [];
  for (const { owner, pattern, what } of COPIES) {
    for (const { path, text } of files) {
      if (path === owner && what !== 'a frame time that ignores the scene’s fps') continue;
      text.split('\n').forEach((line, i) => { if (pattern.test(line) && !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*')) found.push(`${path}:${i + 1}: ${what}: ${line.trim()}`); });
    }
  }
  // readerShellProblems runs in the served page from its source text, so it cannot import PAGE_QUERY;
  // the package smoke test opens the URL a reader types, written out as the reader writes it.
  const exempt = ['tools/lib/explain-reader-shell.ts:', 'tools/repo/explain-package-smoke.ts:'];
  assert.deepEqual(found.filter((f) => !exempt.some((e) => f.startsWith(e))), []);
});

test('the copy search finds a copy: a defect it must reject', () => {
  const planted = "const k = 1000;\nurl.searchParams.set('theme', 'dark');\nnew Rectangle({ width: 16, height: 9 });\nconst zoom = (b[2] - b[0]) / 16;\nconst link = `${id}?step=${name}`;";
  const hits = COPIES.filter(({ pattern }) => planted.split('\n').some((line) => pattern.test(line))).map((c) => c.what);
  assert.deepEqual(hits, ['the 16 × 9 frame', 'the user units per scene unit', 'a page query key']);
  for (const line of ['const zoom = (b[2] - b[0]) / 16;', 'const link = `${id}?step=${name}`;']) assert.ok(COPIES.some(({ pattern }) => pattern.test(line)), line);
});

test('the frame, its home box and the units agree', () => {
  assert.deepEqual([...STAGE_BOX], [-FRAME.w / 2, -FRAME.h / 2, FRAME.w / 2, FRAME.h / 2]);
  assert.equal(FRAME.w / FRAME.h, 16 / 9);
  assert.ok(Number.isInteger(UNITS) && UNITS > 0);
  assert.equal(new Set(Object.values(PAGE_QUERY)).size, Object.keys(PAGE_QUERY).length);
});

test('every character numeric text may hold is in the numeric alphabet the lettering keeps', () => {
  const missing: string[] = [];
  for (let cp = 0; cp <= 0xffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    if (isNumericText(`${c}1`) || isNumericText(`1${c}`) || isNumericText(`1${c}1`) || isNumericText(`1e${c}1`)) {
      if (!numericAlphabet.includes(c) && !/\d/u.test(c)) missing.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('a scene with no meta.id is named by one rule: its folder for scene.ts, else its file', async () => {
  const { sceneIdOf } = await import('../explain/project.ts');
  assert.equal(sceneIdOf('scenes/explainers/hanoi/scene.ts'), 'hanoi');
  assert.equal(sceneIdOf('scenes\\explainers\\hanoi\\scene.ts'), 'hanoi');
  assert.equal(sceneIdOf('recipes/extensions.ts'), 'extensions');
  assert.equal(sceneIdOf('/abs/dir/scene.ts'), 'dir');
  // The command's own rule once read the file's name alone: scene.ts would have named every explainer "scene".
  assert.notEqual(sceneIdOf('a/b/scene.ts'), 'scene');  // A name that is not a page id is refused, as such a meta.id is: a defect the rule must reject.
  assert.throws(() => sceneIdOf('scenes/My Scene/scene.ts'), /^RangeError: meta\.id: the scene has none, and its folder name "My Scene" is not a page id; give it a meta\.id, or rename it/);
  for (const file of ['a/b.c.ts', 'a/.ts', 'scene.ts']) assert.throws(() => sceneIdOf(file), /is not a page id/, file);
  // A folder name the site's evidence would refuse (capitals, _) or Windows cannot write (con) is refused here, by the one rule.
  for (const file of ['a/My_Scene/scene.ts', 'a/Push/scene.ts', 'a/con/scene.ts', 'a/b/Scene.ts']) assert.throws(() => sceneIdOf(file), /is not a page id/, file);
});

test('loadProject holds every scenario to the step rules the command holds', async () => {
  const { loadProject } = await import('../explain/project.ts');
  const { Scene } = await import('../src/index.ts');
  class Still extends Scene {
    static meta = { id: 'still' };
    override async construct() { await this.step('one', { caption: 'One.' }); await this.step('empty'); await this.step('two', { caption: 'Two.' }); }
  }
  await assert.rejects(loadProject(Still, 'test/fixtures/no-such-explainer'), /^Error: this\.step\(\): step "empty" of the scenario \{\} draws no frame of its own/);
  class Twice extends Scene {
    static meta = { id: 'twice' };
    override async construct() { await this.step('Push', { caption: 'One.' }); await this.step('push', { caption: 'Two.' }); }
  }
  await assert.rejects(loadProject(Twice, 'test/fixtures/no-such-explainer'), /share the name "push", ignoring case/);
});
