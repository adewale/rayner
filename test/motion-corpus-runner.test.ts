import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {setImmediate} from 'node:timers/promises';
import {runCorpus} from '../tools/repo/motion-corpus.ts';
import type {EntryResult} from '../tools/repo/motion-corpus-lib.ts';
import {CORPUS} from './fixtures/motion-corpus/corpus.ts';

test('corpus progress arrives on each completion, subtracts its baseline and preserves input order', async t => {
  const pending = new Map<string, (result: EntryResult) => void>(), started: string[] = [], progress: EntryResult[] = [];
  const mock = t.mock.method(childProcess, 'spawn', ((_command: string, args: string[]) => {
    const id = args[args.indexOf('--entry') + 1]!;
    started.push(id);
    const fake = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough()});
    pending.set(id, result => { fake.stdout.end(JSON.stringify(result)); fake.emit('close', 0); });
    return fake;
  }) as unknown as typeof childProcess.spawn);
  syncBuiltinESMExports();
  const entries = ['first', 'second', 'third'].map(id => ({...CORPUS[0]!, id}));
  const baseline = `base-${entries[0]!.chapter}`;
  const known = {scenario: '{}', line: 'one: covers: part “known”'}, fresh = {scenario: '{}', line: 'two: covers: part “new”'};
  const result = (id: string, findings = [known, fresh]): EntryResult => ({id, findings, fresh: findings, caught: !!findings.length, ms: 12});
  try {
    const campaign = runCorpus(entries, {jobs: 2, progress: r => progress.push(r)});
    assert.deepEqual(started, [baseline]);
    pending.get(baseline)!(result(baseline, [known]));
    await setImmediate();
    assert.deepEqual(started, [baseline, 'first', 'second']);
    pending.get('second')!(result('second'));
    await setImmediate();
    assert.deepEqual(progress.map(r => r.id), ['second'], 'reports without waiting for the first entry or the whole pool');
    assert.deepEqual(progress[0]!.fresh, [fresh]);
    assert.ok(started.includes('third'));
    pending.get('first')!(result('first', [known]));
    pending.get('third')!(result('third', [fresh]));
    const completed = await campaign;
    assert.deepEqual(completed.results.map(r => r.id), ['first', 'second', 'third']);
    assert.deepEqual(progress.map(r => r.id), ['second', 'first', 'third']);
    assert.equal(completed.results[0]!.caught, false);
    assert.equal(new Set(started).size, 4);
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});
