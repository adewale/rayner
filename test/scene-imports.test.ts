// The collection is written with the public API only: what a scene under scenes/ imports from the
// library is one of the package's entry points (package.json "exports"), reached by a relative path
// into the checkout. An outside author can then write anything the collection writes. rayner/testing
// is the one entry point a scene may not import: it is for an author's tests and tools.
//
// One style, relative paths: in the checkout they resolve to the same source for tsc, for Node
// running a test that imports a scene, and for the bundler. The package names ('rayner',
// 'rayner/explain', ...) resolve through the package's self-reference to dist/, a second, built
// copy of the engine; the bundler aliases them back, but Node and tsc do not. The package names are
// what an outside author writes, and pack:smoke, test/consumer and recipes/ write them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');

/** The entry points, from package.json "exports": each subpath's types file, as the source it is built from. */
function entryPoints(): Map<string, string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { exports: Record<string, { types: string }> };
  const out = new Map<string, string>();
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    const source = target.types.replace(/^\.\/dist\//, '').replace(/\.d\.ts$/, '.ts');
    out.set(source, subpath === '.' ? 'rayner' : `rayner/${subpath.slice(2)}`);
  }
  return out;
}
const ENTRY = entryPoints();
/** Entry points that are not scene vocabulary: tooling for tests and tools, which no scene imports. */
const NOT_FOR_SCENES = new Set(['explain/testing.ts']);

/**
 * Files that are not scenes and import the player's own modules on purpose. Each says why.
 * catalog.ts lists the collection for the site and the player, and takes the site's home URL
 * from the player so the two cannot disagree.
 */
const EXEMPT: Record<string, readonly string[]> = {
  'scenes/explainers/catalog.ts': ['app/embed-share.ts'],
};

/**
 * A folder's own tests are written like its scene, so an outside author can write them too: a model
 * test (model.test.ts, and any other test but the scene's) imports the folder's files, the collection's
 * and the entry points, and may also use rayner/testing, which is for an author's tests. A folder's
 * scene tests (scene.test.ts) and fidelity checks (fidelity.ts) are this repository's own tests of the
 * scene: they run it with test/lib's helpers and the tools, as the tests under test/ do, so the rule
 * does not hold them.
 */
const isTest = (file: string) => file.endsWith('.test.ts');
const isRepositoryTest = (file: string) => /(^|\/)(scene\.test|fidelity)\.ts$/.test(file);

/** Every import a file makes that breaks the rule, as `file: specifier (why)`. */
function violations(file: string, source: string): string[] {
  const out: string[] = [];
  if (isRepositoryTest(file)) return out;
  const { importedFiles } = ts.preProcessFile(source, true, true);
  for (const { fileName: spec } of importedFiles) {
    if (isTest(file) && (spec === 'rayner/testing' || relative(ROOT, resolve(ROOT, dirname(file), spec)) === 'explain/testing.ts')) continue;
    if (spec === 'rayner/testing') {
      out.push(`${file}: ${spec} (author tooling, for tests and tools: a scene is written with rayner, rayner/explain, rayner/drawing, rayner/geo, rayner/audio and rayner/extras)`);
      continue;
    }
    if (spec === 'rayner' || spec.startsWith('rayner/')) {
      const path = [...ENTRY].find(([, name]) => name === spec)?.[0];
      out.push(`${file}: ${spec} (use the relative path${path ? ` to ${path}` : ''}, as the rest of the collection does)`);
      continue;
    }
    if (!spec.startsWith('.')) continue; // node: built-ins and other packages
    const target = relative(ROOT, resolve(ROOT, dirname(file), spec));
    if (target.startsWith('scenes/')) continue; // the collection's own files
    if (NOT_FOR_SCENES.has(target)) {
      out.push(`${file}: ${spec} (${target} is ${ENTRY.get(target)}, author tooling for tests and tools, not scene vocabulary)`);
      continue;
    }
    if (ENTRY.has(target)) continue;
    if (EXEMPT[file]?.includes(target)) continue;
    out.push(`${file}: ${spec} (${target} is not a public entry point: ${[...ENTRY.keys()].join(', ')})`);
  }
  return out;
}

function sceneFiles(dir = join(ROOT, 'scenes')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sceneFiles(join(dir, e.name)) : /\.(m?[jt]s|tsx)$/.test(e.name) ? [relative(ROOT, join(dir, e.name))] : [],
  );
}

test('the entry points are the documented package exports', () => {
  assert.deepEqual(
    [...ENTRY].sort(),
    [
      ['explain/drawing.ts', 'rayner/drawing'], ['explain/geo.ts', 'rayner/geo'], ['explain/index.ts', 'rayner/explain'], ['explain/score.ts', 'rayner/audio'],
      ['explain/testing.ts', 'rayner/testing'], ['src/extras.ts', 'rayner/extras'], ['src/index.ts', 'rayner'], ['src/output.ts', 'rayner/output'],
    ],
  );
});

test('every file under scenes/ imports the library only through its public entry points, by relative path', () => {
  const files = sceneFiles();
  assert.ok(files.length > 50, `found only ${files.length} files under scenes/`);
  const found = files.flatMap((f) => violations(f, readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(found, []);
});

test('the rule rejects an internal module, a package name and a dynamic import, and allows the entry points', () => {
  const file = 'scenes/explainers/example/scene.ts';
  const seeded = [
    "import { emphasises } from '../../../explain/look.ts';",
    "import type { Card } from '../../../explain/panels.ts';",
    "export { lerpColor } from '../../../src/color.ts';",
    "const words = await import('../../../explain/words.ts');",
    "import { Scene } from 'rayner';",
    "import { HOME } from '../../../app/embed-share.ts';",
    "import { traceScene } from '../../../explain/testing.ts';",
    "import { describeExplainer } from 'rayner/testing';",
  ].join('\n');
  const found = violations(file, seeded);
  assert.equal(found.length, 8, found.join('\n'));
  assert.ok(found.some((v) => v.includes('(explain/testing.ts is rayner/testing, author tooling')), 'the testing entry point by path');
  assert.ok(found.some((v) => v.includes(': rayner/testing (author tooling')), 'the testing entry point by name');
  for (const target of ['explain/look.ts', 'explain/panels.ts', 'src/color.ts', 'explain/words.ts', 'app/embed-share.ts'])
    assert.ok(found.some((v) => v.includes(`(${target} is not a public entry point`)), target);
  assert.ok(found.some((v) => v.includes(': rayner (use the relative path to src/index.ts')));
  const allowed = [
    "import { Scene } from '../../../src/index.ts';",
    "import { stage, Card } from '../../../explain/index.ts';",
    "import { table } from '../../../explain/drawing.ts';",
    "import type { LetteringRequest } from '../../../src/index.ts';",
    "import { renderAt } from '../../../src/output.ts';",
    "import { model } from '../lib/model.ts';",
    "import { readFile } from 'node:fs/promises';",
  ].join('\n');
  assert.deepEqual(violations(file, allowed), []);
});

test('a folder’s model test may use rayner/testing and nothing else a scene may not; its scene tests are the repository’s own', () => {
  const imports = [
    "import { traceScene } from '../../../explain/testing.ts';",
    "import { assertStepState } from '../../../test/lib/explainer-state.ts';",
    "import { collectProject } from '../../../tools/lib/explain-project.ts';",
    "import { emphasises } from '../../../explain/look.ts';",
  ].join('\n');
  const model = violations('scenes/explainers/example/model.test.ts', imports);
  assert.equal(model.length, 3, model.join('\n'));
  for (const target of ['test/lib/explainer-state.ts', 'tools/lib/explain-project.ts', 'explain/look.ts'])
    assert.ok(model.some((v) => v.includes(`(${target} is not a public entry point`)), target);
  assert.equal(violations('scenes/explainers/example/answers.ts', imports).length, 4, 'answers.ts is not a test');
  assert.deepEqual(violations('scenes/explainers/example/scene.test.ts', imports), []);
  assert.deepEqual(violations('scenes/explainers/example/fidelity.ts', imports), []);
});
