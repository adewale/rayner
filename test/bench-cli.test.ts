import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const args of [
  ['--reps', '0'], ['--reps', '-1'], ['--reps', '1.5'], ['--reps', 'NaN'], ['--reps', 'Infinity'],
  ['--cpu', '0'], ['--cpu', 'NaN'], ['--cpu', 'Infinity'],
  ['--read-ms', '-1'], ['--read-ms', 'NaN'], ['--read-ms', 'Infinity'], ['--read-ms', '2147483648'],
  ['--explainers', ''], ['--explainers', '../README'], ['--explainers', 'mr-cache,mr-cache'],
]) test('benchmark refuses invalid options before building: ' + args.join(' '), () => {
  const result = spawnSync(process.execPath, ['tools/repo/bench.ts', args[0] + '=' + args[1], '--base=rayner-bench-invalid-baseline-for-option-tests'], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(args[0] + ' must'));
});
