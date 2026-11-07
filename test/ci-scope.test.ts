import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {proseOnly, requiredJobs, completedCampaign, reusableProof} from '../tools/repo/lib/ci-scope.ts';
test('only prose uses the small owner; every tracked executable input forces full validation', () => {
  assert.equal(proseOnly(['README.md', 'docs/TESTING.md', 'skills/rayner-explainers/SKILL.md']), true);
  assert.equal(proseOnly([]), false);
  const files = execFileSync('git', ['ls-files'], {encoding: 'utf8'}).trim().split('\n');
  for (const file of files.filter(path => !path.endsWith('.md')))
    assert.equal(proseOnly(['README.md', file]), false, file);
  for (const file of ['docs/REFERENCE.md', 'docs/LETTERING.md', 'docs/UPSTREAM.md', 'new-file', '.github/workflows/ci.yml', 'docs/example.json'])
    assert.equal(proseOnly([file]), false, file);
});
test('reusing a campaign requires every protected owner to have run successfully', () => {
  const jobs = requiredJobs.map(name => ({name, conclusion: 'success'}));
  assert.equal(jobs.length, 9);
  assert.equal(completedCampaign(jobs), true);
  for (let i = 0; i < jobs.length; i++) {
    for (const conclusion of ['skipped', 'failure', 'cancelled', null])
      assert.equal(completedCampaign(jobs.map((job, j) => i === j ? {...job, conclusion} : job)), false);
    assert.equal(completedCampaign(jobs.filter((_, j) => i !== j)), false);
    assert.equal(completedCampaign([...jobs, jobs[i]!]), false);
  }
});
test('archive and story must bind the same clean, fully validated checkout and Node version', () => {
  const sha = 'a'.repeat(40);
  const story = {sourceCommit: sha, scenarios: 38, stepWidths: 200, consoleErrors: [] as string[], runtimeConnections: [] as string[]};
  const archive = {sourceCommit: sha, dirty: false, node: 'v24.22.1', gates: {package: true, browser: true, letteringCapture: true}};
  const valid = (s = story, a = archive) => reusableProof(s, a, sha, 'v24.22.1');
  assert.equal(valid(), true);
  for (const change of [{sourceCommit: 'b'.repeat(40)}, {scenarios: 0}, {stepWidths: 0}, {consoleErrors: ['broken']}, {runtimeConnections: ['remote']}])
    assert.equal(valid({...story, ...change}), false);
  for (const change of [{sourceCommit: 'b'.repeat(40)}, {dirty: true}, {node: 'v24.0.0'}, {gates: {package: true, browser: false, letteringCapture: true}}])
    assert.equal(valid(story, {...archive, ...change}), false);
  assert.equal(reusableProof({}, {}, sha, 'v24.22.1'), false);
});

test('a prose run reports every required compatibility context, and is never a campaign', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const job = (name: string) => workflow.split(new RegExp(`^  ${name}:$`, 'm'))[1]!.split(/^  [a-z-]+:$/m)[0]!;
  const contexts = (name: string) => {
    const [, os] = job(name).match(/^ +os: \[(.+)\]$/m)!, [, node] = job(name).match(/^ +node: \[(.+)\]$/m)!;
    return os!.split(', ').flatMap(o => node!.split(', ').map(n => `compatibility (${o}, ${n.replaceAll("'", '')})`));
  };
  const required = requiredJobs.filter(name => name.startsWith('compatibility'));
  assert.deepEqual(contexts('compatibility').sort(), [...required].sort());
  assert.deepEqual(contexts('compatibility-prose').sort(), [...required].sort());
  assert.match(job('compatibility-prose'), /if: needs\.scope\.outputs\.full == 'false'/);
  assert.match(job('compatibility-prose'), /name: compatibility \(\$\{\{ matrix\.os \}\}, \$\{\{ matrix\.node \}\}\)/);

  const prose = requiredJobs.map(name => ({name, conclusion: name === 'check' || name === 'catalog' ? 'skipped' : 'success'}));
  assert.equal(completedCampaign(prose), false);
});
