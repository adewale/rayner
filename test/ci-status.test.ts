import test from 'node:test';
import assert from 'node:assert/strict';
import {ciStatus, unassignedCancellation} from '../tools/repo/lib/ci-status.ts';
import type {JobStatus} from '../tools/repo/lib/ci-status.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, chmod, readFile, writeFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
const job = (change: Partial<JobStatus> = {}): JobStatus => ({id: 17, name: 'compatibility (macos-26, 24)', status: 'completed', conclusion: 'cancelled', created_at: '2026-11-17T00:00:00Z', started_at: '2026-11-17T00:00:00Z', completed_at: '2026-11-17T00:15:00Z', runner_id: 0, runner_name: '', steps: [], ...change});
test('unassigned cancellation is separated from assertion failure, assigned cancellation and a queued job', () => {
  assert.equal(unassignedCancellation(job()), true);
  for (const change of [{runner_id: 1}, {runner_name: 'assigned'}, {steps: [{}]}, {conclusion: 'failure'}, {conclusion: null, status: 'queued'}])
    assert.equal(unassignedCancellation(job(change)), false);
  const report = ciStatus([job(), job({id: 18, name: 'check', conclusion: 'failure', runner_id: 2, steps: [{}], started_at: '2026-11-17T00:10:00Z'})], 'owner/rayner', '123');
  assert.equal(report.unassigned.length, 1);
  assert.match(report.markdown, /unassigned \(15m 0s\)/);
  assert.match(report.markdown, /check \| failure \| 10m 0s \| 5m 0s/);
  assert.match(report.markdown, /gh run rerun 123 --job 17 --repo owner\/rayner/);
  assert.doesNotMatch(report.markdown, /--job 18/);
  assert.match(report.markdown, /cannot rule out manual or concurrency cancellation/);
});
test('diagnostics quote table text, tolerate missing timestamps, and reject unsafe retry arguments', () => {
  const report = ciStatus([job({name: 'one|two\nnext', runner_id: 1, started_at: null, completed_at: null})], 'owner/repo', '1');
  assert.match(report.markdown, /one\\\|two next/);
  assert.match(report.markdown, /cancelled \| — \| —/);
  for (const [repo, runId] of [['bad/repo;echo', '1'], ['owner/repo', 'x'], ['owner/repo', '0']])
    assert.throws(() => ciStatus([job()], repo!, runId!), /invalid CI/);
});

test('the queue summary reads all API pages, writes the report and never requests a mutation', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-ci-status-'));
  try {
    const pages = [{jobs: [job()]}, {jobs: [job({id: 18, name: 'check', conclusion: 'success', runner_id: 12, steps: [{}]})]}];
    await writeFile(join(folder, 'gh'), `#!/usr/bin/env node
const args=process.argv.slice(2);
if(JSON.stringify(args)!==JSON.stringify(['api','--paginate','--slurp','repos/owner/repo/actions/runs/123/jobs?per_page=100']))process.exit(9);
console.log(${JSON.stringify(JSON.stringify(pages))});
`);
    await chmod(join(folder, 'gh'), 0o755);
    const summary = join(folder, 'summary');
    const {stdout} = await promisify(execFile)(process.execPath, [resolve('tools/repo/ci-status.ts')], {env: {
      ...process.env, PATH: folder + ':' + process.env.PATH, GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '123', GITHUB_STEP_SUMMARY: summary,
    }});
    const markdown = await readFile(summary, 'utf8');
    assert.match(markdown, /check \| success/);
    assert.match(markdown, /--job 17/);
    assert.match(stdout, /::warning title=Runner was never assigned::Job 17/);
    assert.doesNotMatch(stdout, /::warning[^\n]*Job 18/);
  } finally { await rm(folder, {recursive: true, force: true}); }
});
