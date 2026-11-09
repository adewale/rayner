// Property tests draw from the seed committed in scenes/explainers/lib/pbt.ts, so a run and its re-run
// draw the same cases; and a failed property leaves the command that replays it
// (tools/repo/lib/property-replay.ts, printed by tools/repo/ci-tests.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { replayCommands } from '../tools/repo/lib/property-replay.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PBT = pathToFileURL(join(ROOT, 'test/lib/pbt.ts')).href;
const env = (extra: Record<string, string> = {}) => {
  // Without this run's seed, path and count, and as a run of its own rather than this test's child.
  const { FC_SEED: _s, FC_PATH: _p, FULL: _f, NODE_TEST_CONTEXT: _c, ...rest } = process.env;
  return { ...rest, ...extra };
};
const draw = (extra?: Record<string, string>) => {
  const code = `import { fc } from ${JSON.stringify(PBT)}; console.log(JSON.stringify(fc.sample(fc.array(fc.integer()), 20)));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8', env: env(extra) });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

test('two processes draw the same cases from the committed seed, and FC_SEED draws others', () => {
  const first = draw();
  assert.equal(draw(), first);
  assert.notEqual(draw({ FC_SEED: '1' }), first);
  assert.equal(draw({ FC_SEED: '1' }), draw({ FC_SEED: '1' }));
});

test('a failed property prints the command that replays its counterexample', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rayner-replay-'));
  try {
    const file = join(dir, 'fails.test.ts');
    writeFileSync(file, [
      "import { test } from 'node:test';",
      `import { fc, params } from ${JSON.stringify(PBT)};`,
      "test('a list (of small numbers) sums under 50', () => {",
      '  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 20 })), (xs) => { if (xs.reduce((a, b) => a + b, 0) >= 50) throw new Error(`sum of ${xs}`); }), params(200));',
      '});',
      "test('a test that passes', () => {});",
    ].join('\n'));
    const run = spawnSync(process.execPath, [join(ROOT, 'tools/repo/ci-tests.ts'), '--test', file], { cwd: dir, encoding: 'utf8', env: env({ FC_SEED: '424242' }) });
    assert.notEqual(run.status, 0);
    const counterexample = (out: string) => /Counterexample: (.+)/.exec(out)?.[1];
    const found = counterexample(run.stdout);
    assert.ok(found, run.stdout);
    const [command, ...more] = [...run.stdout.matchAll(/^::error title=Replay this failed property::(.+)$/gm)].map((m) => m[1]!);
    assert.equal(more.length, 0);
    assert.match(command!, /^FC_SEED=424242 FC_PATH=[\d:]+ node --test /);
    // The command alone, in a fresh shell without the run's seed, fails on the same counterexample, at once.
    const replay = spawnSync('sh', ['-c', command!], { cwd: dir, encoding: 'utf8', env: env() });
    assert.notEqual(replay.status, 0);
    assert.equal(counterexample(replay.stdout), found);
    assert.match(replay.stdout, /Property failed after 1 tests/);
    assert.match(replay.stdout, /ℹ pass 0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replay commands quote a test name as a literal pattern, and skip failures that are not properties', () => {
  const log = [
    '✔ fine (1ms)',
    '✖ failing tests:',
    '',
    'test at test/a b.test.ts:3:1',
    "✖ it's (x+1) * 2, not $x (12.5ms)",
    '  Error: Property failed after 4 tests',
    '  { seed: -12, path: "3:0:1", endOnFailure: true }',
    '  Counterexample: [1]',
    '',
    'test at test/c.test.ts:9:1',
    '✖ a plain assertion (2ms)',
    '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal',
  ].join('\n');
  assert.deepEqual(replayCommands(log, true), [
    String.raw`FC_SEED=-12 FC_PATH=3:0:1 FULL=1 node --test --test-name-pattern='^it'\''s \(x\+1\) \* 2, not \$x$' 'test/a b.test.ts'`,
  ]);
  assert.deepEqual(replayCommands('✔ all passed (1ms)'), []);
});
