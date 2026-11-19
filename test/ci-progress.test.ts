import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {commandProgress, progressArgs} from '../tools/repo/lib/ci-progress.ts';
import fileProgress from '../tools/repo/lib/ci-file-reporter.ts';
import type {TestEvent} from 'node:test/reporters';

test('relative file events are normalized while nested and ordinary named tests are excluded', async () => {
  const file = resolve('test/example.test.ts');
  const events = [
    {type: 'test:dequeue', data: {name: 'test/example.test.ts', file, nesting: 0}},
    {type: 'test:complete', data: {name: 'test/example.test.ts', file, nesting: 0, details: {passed: true, duration_ms: 1234}}},
    {type: 'test:complete', data: {name: file, file, nesting: 1, details: {passed: true, duration_ms: 10}}},
    {type: 'test:complete', data: {name: 'an ordinary test', file, nesting: 0, details: {passed: true, duration_ms: 10}}},
  ] as TestEvent[];
  const output: string[] = [];
  for await (const line of fileProgress((async function* () { yield* events; })())) output.push(line);
  assert.deepEqual(output, ['[ci] file started: test/example.test.ts\n', '[ci] file passed: test/example.test.ts (1.23s)\n']);
});

test('a silent command gets a 30-second heartbeat; output resets its quiet time and finish cancels the clock', () => {
  let now = 0, cancelled = 0, tick = () => {};
  const lines: string[] = [];
  const progress = commandProgress(line => lines.push(line), {
    now: () => now,
    every(callback, milliseconds) { assert.equal(milliseconds, 30_000); tick = callback; return () => { cancelled++; }; },
  });
  now = 30_000; tick();
  assert.match(lines.at(-1)!, /running 30s; last child output 30s ago/);
  now = 45_000; progress.output();
  now = 60_000; tick();
  assert.match(lines.at(-1)!, /running 60s; last child output 15s ago/);
  progress.finish(null, 'SIGTERM');
  assert.match(lines.at(-1)!, /finished in 60.0s \(SIGTERM\)/);
  const before = lines.length;
  now = 90_000; tick(); progress.finish(0, null);
  assert.equal(lines.length, before); assert.equal(cancelled, 1);
});

test('progress preserves chosen result reporters and file destinations, leaves non-test and invalid commands alone', () => {
  const args = ['--test', '--test-reporter', 'junit', '--test-reporter-destination=report.xml', 'a.test.ts'];
  const actual = progressArgs(args);
  assert.ok(actual.includes('--test-reporter=junit'));
  assert.ok(actual.includes('--test-reporter-destination=report.xml'));
  assert.ok(actual.includes('--test-reporter-destination=stderr'));
  assert.equal(actual.at(-1), 'a.test.ts');
  for (const other of [['/bin/npm', 'run', 'test:embeds'], ['script.mjs', '--test'], ['--expose-gc', 'script.mjs', '--test'], ['--test', '--test-reporter'], ['--test', '--test-reporter=a', '--test-reporter=b'], ['--', '--test']])
    assert.deepEqual(progressArgs(other), other);
});

test('cancelling the wrapper reaches a live child and preserves its failing shutdown status', {timeout: 30_000}, async () => {
  const {NODE_TEST_CONTEXT: _context, ...env} = process.env;
  const child = spawn(process.execPath, [resolve('tools/repo/ci-tests.ts'), '--input-type=module', '-e',
    "process.on('SIGTERM',()=>{console.log('child stopped');process.exit(7)});console.log('child ready');setInterval(()=>{},1000)"], {env});
  let stdout = '', stderr = '', sent = false;
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (!sent && stdout.includes('child ready')) { sent = true; child.kill('SIGTERM'); }
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
  const status = await new Promise<number | null>((done, reject) => { child.on('error', reject); child.on('close', done); });
  clearTimeout(timer);
  assert.equal(status, 7, stdout + stderr);
  assert.match(stdout, /child stopped/);
  assert.match(stderr, /finished .*exit 7/);
});

for (const mode of ['absolute', 'relative', 'glob'] as const) test(`${mode} test paths report fast completion before an earlier blocked file and preserve failure`, {timeout: 30_000}, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-ci-progress-'));
  const wrapper = resolve('tools/repo/ci-tests.ts'), release = join(folder, 'release');
  const slow = join(folder, 'a-slow.test.mjs'), fast = join(folder, 'b-fast.test.mjs');
  const {NODE_TEST_CONTEXT: _context, ...env} = process.env;
  try {
    await writeFile(slow, `import {test} from 'node:test'; import {existsSync} from 'node:fs'; test('slow result',async()=>{while(!existsSync(${JSON.stringify(release)}))await new Promise(r=>setTimeout(r,10));});`);
    await writeFile(fast, "import {test} from 'node:test'; test('fast result',()=>{});");
    const files = mode === 'absolute' ? [slow, fast] : mode === 'relative' ? [relative(process.cwd(), slow), relative(process.cwd(), fast)] : [relative(process.cwd(), join(folder, '*.test.mjs'))];
    const child = spawn(process.execPath, [wrapper, '--test', '--test-concurrency=2', '--test-reporter=spec', ...files], {env});
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (/\[ci\] file passed: .*fast\.test\.mjs/.test(stderr)) writeFileSync(release, 'release');
    });
    // This is an external barrier, not a timing race: only a live fast-file completion unblocks slow.
    const timer = setTimeout(() => child.kill('SIGTERM'), 20_000);
    const status = await new Promise<number | null>((done, reject) => { child.on('error', reject); child.on('close', done); });
    clearTimeout(timer);
    assert.equal(status, 0, stdout + stderr);
    const fastAt = stderr.search(/\[ci\] file passed: .*fast\.test\.mjs/), slowAt = stderr.search(/\[ci\] file passed: .*slow\.test\.mjs/);
    assert.ok(fastAt >= 0 && slowAt > fastAt, stderr);
    assert.equal((stderr.match(/\[ci\] file started:/g) ?? []).length, 2);
    assert.equal((stderr.match(/\[ci\] file passed:/g) ?? []).length, 2);
    assert.ok(stdout.indexOf('✔ slow result') < stdout.indexOf('✔ fast result'), stdout);
    assert.match(stderr, /\[ci\] finished .*exit 0/);
    await writeFile(fast, "import {test} from 'node:test'; test('a broken assertion',()=>{throw new Error('deliberate defect')});");
    const failed = spawn(process.execPath, [wrapper, '--test', mode === 'absolute' ? fast : relative(process.cwd(), fast)], {env});
    let output = '';
    failed.stdout.on('data', chunk => { output += chunk; }); failed.stderr.on('data', chunk => { output += chunk; });
    assert.equal(await new Promise(done => failed.on('close', done)), 1);
    assert.match(output, /file failed: .*fast\.test\.mjs/);
    assert.match(output, /deliberate defect/);
    assert.match(output, /::error title=Tests failed::/);
  } finally { await rm(folder, {recursive: true, force: true}); }
});
