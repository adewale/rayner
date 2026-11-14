// Oracle skips: a model test that cannot run its outside system skips locally, and fails in CI's check
// job, which sets RAYNER_REQUIRE_ORACLES=1 (scenes/explainers/lib/oracle.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRE_ORACLES, oraclesRequired, skipOptionalOracle, skipOracle } from '../scenes/explainers/lib/oracle.ts';

const ROOT = join(import.meta.dirname, '..');
const recorder = () => {
  const skipped: (string | undefined)[] = [];
  return { skipped, t: { skip: (message?: string) => void skipped.push(message) } };
};

test('a required oracle that can run is not skipped, whatever the environment', () => {
  for (const env of [{}, { [REQUIRE_ORACLES]: '1' }]) {
    const { skipped, t } = recorder();
    assert.equal(skipOracle(t, false, env), false);
    assert.equal(skipOracle(t, undefined, env), false);
    assert.deepEqual(skipped, []);
  }
});

test('a required oracle that cannot run skips locally and fails under RAYNER_REQUIRE_ORACLES=1', () => {
  for (const env of [{}, { [REQUIRE_ORACLES]: '0' }, { [REQUIRE_ORACLES]: '' }]) {
    const { skipped, t } = recorder();
    assert.equal(skipOracle(t, 'no rustc on PATH', env), true);
    assert.deepEqual(skipped, ['no rustc on PATH']);
  }
  const { skipped, t } = recorder();
  assert.throws(() => skipOracle(t, 'no rustc on PATH', { [REQUIRE_ORACLES]: '1' }), /^Error: no rustc on PATH\. RAYNER_REQUIRE_ORACLES=1 requires this oracle to run here/);
  assert.deepEqual(skipped, [], 'it fails rather than skips');
  assert.equal(oraclesRequired({ [REQUIRE_ORACLES]: '1' }), true);
  assert.equal(oraclesRequired({ [REQUIRE_ORACLES]: 'true' }), false, 'only 1 requires them');
});

test('an optional rerun of a frozen oracle skips even under RAYNER_REQUIRE_ORACLES=1', () => {
  const previous = process.env[REQUIRE_ORACLES];
  process.env[REQUIRE_ORACLES] = '1';
  try {
    const { skipped, t } = recorder();
    assert.equal(skipOptionalOracle(t, 'set SABRE_DOCKER=1'), true);
    assert.equal(skipOptionalOracle(t, false), false);
    assert.deepEqual(skipped, ['set SABRE_DOCKER=1']);
  } finally {
    if (previous === undefined) delete process.env[REQUIRE_ORACLES];
    else process.env[REQUIRE_ORACLES] = previous;
  }
});

/** Each explainer's test files: its *.test.ts and fidelity.ts. */
function explainerTests(): { id: string; file: string; text: string }[] {
  const dir = join(ROOT, 'scenes/explainers'), out = [];
  for (const id of readdirSync(dir)) {
    if (id === 'lib' || !existsSync(join(dir, id, 'scene.ts'))) continue;
    for (const name of readdirSync(join(dir, id)))
      if (name.endsWith('.test.ts') || name === 'fidelity.ts') out.push({ id, file: `${id}/${name}`, text: readFileSync(join(dir, id, name), 'utf8') });
  }
  return out;
}

test('every skip in an explainer’s tests goes through the oracle helpers, so CI can refuse it', () => {
  const raw: string[] = [];
  for (const { file, text } of explainerTests())
    text.split('\n').forEach((line, i) => {
      // t.skip(...), test.skip(...), or a test's own { skip: ... } option
      if (/\.skip\s*\(/.test(line) || /\b(?:test|it|describe|suite)\s*\(\s*(['"`]).*?\1\s*,\s*\{[^}]*\bskip\s*:/.test(line)) raw.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  assert.deepEqual(raw, [], 'use skipOracle (CI runs it) or skipOptionalOracle (a rerun CI does not run) from scenes/explainers/lib/oracle.ts');
});

test('CI’s check job requires the oracles, and docs/TESTING.md names every explainer whose oracle CI runs or only reruns by hand', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const check = /\n  check:\n([\s\S]*?)\n  [a-z-]+:\n/.exec(ci)?.[1] ?? '';
  assert.match(check, /\n    env:\n(?:      .*\n)*      RAYNER_REQUIRE_ORACLES: '1'/, 'the check job sets RAYNER_REQUIRE_ORACLES=1 for its whole run');
  const docs = readFileSync(join(ROOT, 'docs/TESTING.md'), 'utf8');
  const section = /\n## Oracles CI runs and recordings\n([\s\S]*?)(?:\n## |$)/.exec(docs)?.[1];
  assert.ok(section, 'docs/TESTING.md has a section "Oracles CI runs and recordings"');
  const [live = '', recorded = ''] = section!.split(/\n### Recorded/);
  const uses = (pattern: RegExp) => [...new Set(explainerTests().filter((f) => pattern.test(f.text)).map((f) => f.id))].sort();
  for (const id of uses(/\bskipOracle\(/)) assert.match(live, new RegExp(`\\| ${id} \\|`), `${id} runs a required oracle; list it under the oracles CI runs`);
  for (const id of uses(/\bskipOptionalOracle\(/)) assert.match(recorded, new RegExp(`\\| ${id} \\|`), `${id} has an optional rerun; list it under the recordings`);
});
