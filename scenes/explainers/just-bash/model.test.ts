import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../lib/pbt.ts';
import { exec } from './model.ts';

test('shell execution returns a new filesystem and never mutates its input', () => {
  const original = { fs: {}, steps: 0 };
  const next = exec(
    original,
    [
      ['echo', 'hello'],
      ['tr', 'a-z', 'A-Z'],
    ],
    'shout.txt',
  );
  assert.deepEqual(original, { fs: {}, steps: 0 });
  assert.equal(next.shell.fs['shout.txt'], 'HELLO\n');
  assert.equal(next.stdout, '');
  assert.equal(exec(original, [['cat', 'shout.txt']]).stdout, '');
  assert.equal(exec(next.shell, [['cat', 'shout.txt']]).stdout, 'HELLO\n');
});

test('property: exec leaves any shell it is given unchanged and puts a redirect’s write only in the shell it returns', () => {
  const name = fc.constantFrom('a.txt', 'b.txt', 'shout.txt');
  const stage = fc.oneof(
    fc.tuple(fc.constant('echo'), fc.string({ maxLength: 6 })),
    fc.constant(['tr', 'a-z', 'A-Z'] as const),
    fc.tuple(fc.constant('cat'), name),
  );
  fc.assert(fc.property(
    fc.dictionary(name, fc.string({ maxLength: 6 })),
    fc.nat(5),
    fc.array(stage, { minLength: 1, maxLength: 4 }),
    fc.option(name, { nil: undefined }),
    (files, steps, stages, redirect) => {
      const shell = { fs: { ...files }, steps },
        before = structuredClone(shell);
      const run = exec(shell, stages, redirect);
      assert.deepEqual(shell, before);
      if (redirect) {
        assert.equal(run.stdout, '');
        assert.ok(redirect in run.shell.fs);
      }
      for (const f of Object.keys(run.shell.fs)) if (f !== redirect) assert.equal(run.shell.fs[f], shell.fs[f]);
    },
  ), params(300));
});
