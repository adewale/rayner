// rayner/extras is the worked example of extending Rayner (docs/EXTENDING.md), so it is built as an
// outside author's module would be: every file under extras/ imports nothing but a public entry point
// (package.json "exports"), reached by a relative path into the checkout as the collection reaches
// them (test/scene-imports.test.ts), and its own sibling files. rayner/testing is for tests and tools,
// not for what a scene draws, so an extra may not import it. And since the explainer layer builds on
// rayner/extras (the diagrams grow their bars and send their tokens with it), an extra imports the
// engine's entry point, rayner, and no other: one that imported rayner/explain would make a cycle.
// Each extra says in its comment which public names it builds on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');

/** The entry points, from package.json "exports": each one's source file, by package name. */
const ENTRY = new Map(
  Object.entries((JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { exports: Record<string, { types: string }> }).exports).map(
    ([subpath, target]) => [target.types.replace(/^\.\/dist\//, '').replace(/\.d\.ts$/, '.ts'), subpath === '.' ? 'rayner' : `rayner/${subpath.slice(2)}`],
  ),
);
/** The one entry point an extra builds on: the engine's. */
const BUILDS_ON = 'src/index.ts';

/** Every import a file under extras/ makes that breaks the rule, as `file: specifier (why)`. */
function violations(file: string, source: string): string[] {
  const out: string[] = [];
  const { importedFiles } = ts.preProcessFile(source, true, true);
  for (const { fileName: spec } of importedFiles) {
    if (spec === 'rayner' || spec.startsWith('rayner/')) {
      out.push(`${file}: ${spec} (use the relative path to the entry point's source, as the collection does: the package name resolves to dist/, a second copy of the engine)`);
      continue;
    }
    if (!spec.startsWith('.')) {
      out.push(`${file}: ${spec} (an extra imports only Rayner's entry points and its own files)`);
      continue;
    }
    const target = relative(ROOT, resolve(ROOT, dirname(file), spec));
    if (target.startsWith('extras/')) continue;
    if (target === BUILDS_ON) continue;
    if (ENTRY.has(target)) out.push(`${file}: ${spec} (${target} is ${ENTRY.get(target)}; an extra builds on rayner alone, since the explainer layer builds on rayner/extras)`);
    else out.push(`${file}: ${spec} (${target} is not a public entry point: an extra uses only what an outside author can import)`);
  }
  return out;
}

const files = readdirSync(join(ROOT, 'extras')).filter((f) => f.endsWith('.ts')).map((f) => `extras/${f}`);

test('rayner/extras is a package entry point, built from extras/index.ts', () => {
  assert.equal(ENTRY.get('extras/index.ts'), 'rayner/extras');
});

test('every file under extras/ imports only the engine\'s public entry point and its own files', () => {
  assert.ok(files.length >= 4, `found only ${files.join(', ')}`);
  assert.deepEqual(files.flatMap((f) => violations(f, readFileSync(join(ROOT, f), 'utf8'))), []);
});

test('the rule rejects an internal module, another entry point, rayner/testing, a package name and a dynamic import', () => {
  const seeded = [
    "import { families } from '../src/animation.ts';",
    "import type { Vec } from '../src/vec.ts';",
    "import { stage } from '../explain/index.ts';",
    "import { traceScene } from '../explain/testing.ts';",
    "import { Scene } from 'rayner';",
    "const look = await import('../explain/look.ts');",
    "import { readFile } from 'node:fs/promises';",
  ].join('\n');
  const found = violations('extras/example.ts', seeded);
  assert.equal(found.length, 7, found.join('\n'));
  for (const target of ['src/animation.ts', 'src/vec.ts', 'explain/look.ts']) assert.ok(found.some((v) => v.includes(`(${target} is not a public entry point`)), target);
  assert.ok(found.some((v) => v.includes('(explain/index.ts is rayner/explain;')), 'another entry point');
  assert.ok(found.some((v) => v.includes('(explain/testing.ts is rayner/testing;')), 'the testing entry point');
  const allowed = ["import { Animation } from '../src/index.ts';", "import type { Style } from '../src/index.ts';", "import { GrowFromEdge } from './animations.ts';"].join('\n');
  assert.deepEqual(violations('extras/example.ts', allowed), []);
});

test('each extra says which public names it builds on', () => {
  const source = files.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  for (const [extra, builtOn] of [
    ['GrowFromEdge', 'Built on `Animation`'], ['PulseAlongPath', 'Built on `MoveAlongPath`'], ['ArcBetweenPoints', 'Built on `Arc`'],
    ['rushInto', 'Built on `smooth`'], ['rushFrom', 'Built on `smooth`'], ['thereAndBack', 'Built on `smooth`'],
  ] as const) {
    const at = source.search(new RegExp(`export (class|const) ${extra}\\b`));
    assert.ok(at > 0, `${extra} is exported`);
    const comment = source.slice(source.lastIndexOf('/**', at), at);
    assert.ok(comment.includes(builtOn), `${extra}'s comment says "${builtOn}"`);
  }
});

test('the walk-through in docs/EXTENDING.md prints GrowFromEdge as extras/animations.ts holds it, with the package\'s import', () => {
  const doc = readFileSync(join(ROOT, 'docs/EXTENDING.md'), 'utf8');
  const source = readFileSync(join(ROOT, 'extras/animations.ts'), 'utf8');
  const blocks = [...doc.matchAll(/<!-- from extras\/animations\.ts -->\n```ts\n([\s\S]*?)```/g)].map(([, code]) => code!);
  assert.ok(blocks.length >= 6, `found ${blocks.length} printed pieces`);
  for (const code of blocks) assert.ok(source.includes(code.replaceAll("from 'rayner';", "from '../src/index.ts';")), `extras/animations.ts holds:\n${code}`);
  // After the imports, the pieces together print the whole of GrowFromEdge, its options first.
  const start = source.indexOf('export interface GrowFromEdgeOptions'), end = source.indexOf('\n}\n', source.indexOf('export class GrowFromEdge')) + 3;
  assert.equal(blocks.slice(1).join('\n'), source.slice(start, end));
});

test('the extras module exports exactly the extras', async () => {
  assert.deepEqual(Object.keys(await import('../extras/index.ts')).sort(), ['ArcBetweenPoints', 'GrowFromEdge', 'PulseAlongPath', 'rushFrom', 'rushInto', 'thereAndBack']);
});
