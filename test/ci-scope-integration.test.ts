import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chmod, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
const run = promisify(execFile);
test('CI reuses only a recent full PR campaign for the actual merged tree; absent proof and dispatches run full CI', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-ci-policy-'));
  const repo = join(folder, 'repo'), bin = join(folder, 'bin'), apiFile = join(folder, 'api.json');
  const scope = resolve('tools/ci-scope.ts');
  try {
    await mkdir(repo); await mkdir(bin);
    const git = async (...args: string[]) => (await run('git', args, {cwd: repo})).stdout.trim();
    await git('init', '-b', 'main');
    await git('config', 'user.name', 'CI fixture'); await git('config', 'user.email', 'fixture@example.org');
    await writeFile(join(repo, 'source.ts'), 'base'); await git('add', '.'); await git('commit', '-m', 'base');
    const base = await git('rev-parse', 'HEAD');
    await writeFile(join(repo, 'source.ts'), 'feature'); await git('commit', '-am', 'feature');
    const head = await git('rev-parse', 'HEAD');
    const tested = await git('commit-tree', await git('rev-parse', 'HEAD^{tree}'), '-p', base, '-p', head, '-m', 'tested synthetic merge');
    await git('commit', '--allow-empty', '-m', 'merged tree');
    const merged = await git('rev-parse', 'HEAD');
    await git('remote', 'add', 'origin', repo);
    // Fake only GitHub transport; ancestry, fetching and tree comparisons use real Git.
    await writeFile(join(bin, 'gh'), `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const data=JSON.parse(fs.readFileSync(process.env.CI_FIXTURE_API,'utf8')),args=process.argv.slice(2);
if(args[0]==='api') {if(!(args[1] in data.api))process.exit(1);process.stdout.write(JSON.stringify(data.api[args[1]]));}
else {const dest=args[args.indexOf('--dir')+1],name=args[args.indexOf('--name')+1];fs.writeFileSync(path.join(dest,name.startsWith('rayner-story-')?'browser-review.json':'manifest.json'),JSON.stringify(name.startsWith('rayner-story-')?data.story:data.archive));}
`);
    await chmod(join(bin, 'gh'), 0o755);
    const prefix = 'repos/owner/rayner';
    const make = () => ({api: {
      [`${prefix}/commits/${merged}/pulls`]: [{merged_at: new Date().toISOString(), merge_commit_sha: merged, base: {ref: 'main'}, head: {sha: head, repo: {full_name: 'owner/rayner'}}}],
      [`${prefix}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&status=success&per_page=10`]: {workflow_runs: [{id: 1, created_at: new Date().toISOString(), head_repository: {full_name: 'owner/rayner'}}]},
      [`${prefix}/actions/runs/1/jobs?per_page=100`]: {jobs: ['check', 'catalog', 'story', 'compatibility (ubuntu-24.04, 24.0.0)', 'compatibility (ubuntu-24.04, 24)', 'compatibility (macos-26, 24.0.0)', 'compatibility (macos-26, 24)', 'compatibility (macos-15-intel, 24.0.0)', 'compatibility (macos-15-intel, 24)'].map(name => ({name, conclusion: 'success'}))},
      [`${prefix}/actions/runs/1/artifacts?per_page=100`]: {artifacts: [{name: `rayner-story-${tested}`, expired: false}, {name: `rayner-package-${tested}`, expired: false}]},
    } as Record<string, any>, story: {sourceCommit: tested, cases: 38, stepWidths: 200, consoleErrors: [], runtimeConnections: []},
      archive: {sourceCommit: tested, dirty: false, node: process.version, gates: {package: true, browser: true, letteringCapture: true}}});
    const event = join(folder, 'event.json'), output = join(folder, 'output'), summary = join(folder, 'summary');
    await writeFile(event, '{}');
    const invoke = async (data: ReturnType<typeof make>, eventName = 'push', sourceCommit = merged) => {
      await writeFile(apiFile, JSON.stringify(data)); await writeFile(output, '');
      await run(process.execPath, [scope], {cwd: repo, env: {...process.env, PATH: bin + ':' + process.env.PATH,
        CI_FIXTURE_API: apiFile, GITHUB_REPOSITORY: 'owner/rayner', GITHUB_SHA: sourceCommit, GITHUB_REF: 'refs/heads/main',
        GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary}});
      return (await readFile(output, 'utf8')).trim().split('\n')[0];
    };
    assert.equal(await invoke(make()), 'full=false');
    assert.equal(await invoke(make(), 'workflow_dispatch'), 'full=true', 'release dispatch cannot reuse old artifacts');
    for (const defect of [
      (d: ReturnType<typeof make>) => { d.api[`${prefix}/actions/runs/1/jobs?per_page=100`].jobs[0].conclusion = 'skipped'; },
      (d: ReturnType<typeof make>) => { d.api[`${prefix}/actions/runs/1/artifacts?per_page=100`].artifacts.pop(); },
      (d: ReturnType<typeof make>) => { d.api[`${prefix}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&status=success&per_page=10`].workflow_runs[0].created_at = '2020-01-01'; },
      (d: ReturnType<typeof make>) => { d.archive.dirty = true; },
      (d: ReturnType<typeof make>) => { delete d.api[`${prefix}/commits/${merged}/pulls`]; },
      (d: ReturnType<typeof make>) => {
        d.story.sourceCommit = base; d.archive.sourceCommit = base;
        d.api[`${prefix}/actions/runs/1/artifacts?per_page=100`].artifacts = [{name: `rayner-story-${base}`}, {name: `rayner-package-${base}`}];
      },
    ]) { const data = make(); defect(data); assert.equal(await invoke(data), 'full=true'); }
    await writeFile(join(repo, 'README.md'), 'Updated prose.');
    await git('add', 'README.md'); await git('commit', '-m', 'prose');
    await writeFile(event, JSON.stringify({pull_request: {base: {sha: merged}, head: {sha: await git('rev-parse', 'HEAD')}}}));
    assert.equal(await invoke(make(), 'pull_request'), 'full=false');
    await writeFile(event, JSON.stringify({before: merged}));
    assert.equal(await invoke(make(), 'push', await git('rev-parse', 'HEAD')), 'full=false', 'merged prose runs its small owner on main too');
    assert.match(await readFile(output, 'utf8'), /prose=true/);
    await mkdir(join(repo, 'docs'));
    await writeFile(join(repo, 'docs/REFERENCE.md'), 'Executable reference.');
    await git('add', 'docs'); await git('commit', '-m', 'reference base');
    const referenceBase = await git('rev-parse', 'HEAD');
    await git('mv', 'docs/REFERENCE.md', 'docs/notes.md'); await git('commit', '-m', 'rename reference');
    await writeFile(event, JSON.stringify({pull_request: {base: {sha: referenceBase}, head: {sha: await git('rev-parse', 'HEAD')}}}));
    assert.equal(await invoke(make(), 'pull_request'), 'full=true', 'renaming an executable doc cannot hide its removal');
    const clean = await git('rev-parse', 'HEAD');
    await writeFile(join(repo, 'docs/notes.md'), 'Trailing whitespace. \n');
    await git('commit', '-am', 'bad whitespace');
    const dirtyProse = await git('rev-parse', 'HEAD');
    await writeFile(event, JSON.stringify({pull_request: {base: {sha: clean}, head: {sha: dirtyProse}}}));
    await assert.rejects(invoke(make(), 'pull_request'), /trailing whitespace/);
    await writeFile(event, JSON.stringify({before: clean}));
    await assert.rejects(invoke(make(), 'push', dirtyProse), /trailing whitespace/);
  } finally { await rm(folder, {recursive: true, force: true}); }
});
