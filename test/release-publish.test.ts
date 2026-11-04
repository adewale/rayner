import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
const script = new URL('../tools/publish-release.ts', import.meta.url).pathname;

async function attempt({env = {}, change = (m: Record<string, unknown>) => {}, corrupt = false, mode = '', undated = false, staleReport = false} = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-publish-guard-'));
  try {
    const directory = join(folder, 'out/release'), bin = join(folder, 'bin');
    await mkdir(directory, {recursive: true}); await mkdir(bin);
    const bytes = Buffer.from('the reviewed archive');
    const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    const manifest = {name: 'rayner', version: '0.1.1', filename: 'rayner-0.1.1.tgz', sourceCommit: 'a'.repeat(40), dirty: false, integrity, gates: {package: true, browser: true, letteringCapture: true}};
    change(manifest);
    await writeFile(join(directory, manifest.filename), corrupt ? 'changed archive' : bytes);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    await mkdir(join(directory, 'validation'));
    for (const name of ['browser-review.json', 'page-budgets.json', 'native-safari.json', 'webkit.json'])
      await writeFile(join(directory, 'validation', name), JSON.stringify({sourceCommit: (staleReport && name === 'native-safari.json' ? 'b' : 'a').repeat(40)}));
    await writeFile(join(folder, 'CHANGELOG.md'), `# Changelog\n\n## 0.1.1 (${undated ? 'unreleased' : '2026-10-29'})\n\nA reviewed fix.\n`);
    const calls = join(folder, 'calls.jsonl');
    // These are the only npm/gh commands reachable from the subprocess. No real
    // credentials, publication, release or network connection can be exercised.
    for (const name of ['npm', 'gh']) {
      const file = join(bin, name);
      await writeFile(file, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(process.env.RELEASE_CALLS,JSON.stringify({command:${JSON.stringify(name)},args})+'\\n');if(${JSON.stringify(name)}==='npm'&&args[0]==='--version')console.log('11.20.0');if(process.env.RELEASE_MODE==='draft-fails'&&${JSON.stringify(name)}==='gh')process.exit(2);\n`);
      await chmod(file, 0o755);
    }
    const preload = join(folder, 'network.mjs');
    await writeFile(preload, `let n=0;globalThis.fetch=async()=>{n++;if(n===1)return new Response('{}',{status:process.env.RELEASE_MODE==='exists'?200:process.env.RELEASE_MODE==='registry-fails'?503:404});return Response.json({dist:{integrity:process.env.RELEASE_MODE==='wrong-bytes'?'wrong':${JSON.stringify(integrity)}}});};`);
    let code = 0, stderr = '';
    try {
      await run(process.execPath, ['--import', preload, script], {cwd: folder, env: {...process.env, PATH: bin + ':' + process.env.PATH, RELEASE_CALLS: calls, RELEASE_MODE: mode, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'adewale/rayner', GITHUB_REF: 'refs/tags/v0.1.1', GITHUB_SHA: 'a'.repeat(40), NPM_DIST_TAG: 'latest', ...env}});
    } catch (error) { code = Number((error as {code: number}).code); stderr = (error as {stderr: string}).stderr; }
    const recorded = (await readFile(calls, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as {command: string; args: string[]});
    return {code, stderr, recorded};
  } finally { await rm(folder, {recursive: true, force: true}); }
}

test('publication refuses invalid context, unvalidated bytes and existing versions before external writes', async () => {
  const scenarios = [
    {env: {GITHUB_ACTIONS: 'false'}}, {env: {GITHUB_REPOSITORY: 'someone/else'}},
    {env: {GITHUB_REF: 'refs/heads/main'}}, {env: {GITHUB_SHA: 'b'.repeat(40)}},
    {env: {NPM_DIST_TAG: 'unexpected'}}, {change: (m: Record<string, unknown>) => {m.dirty = true;}},
    {change: (m: Record<string, unknown>) => {m.version = '0.2.0';}},
    {change: (m: Record<string, unknown>) => {m.filename = '../other.tgz';}},
    {change: (m: Record<string, unknown>) => {m.gates = {package: true, browser: false, letteringCapture: true};}},
    {change: (m: Record<string, unknown>) => {m.gates = {package: true, browser: true, letteringCapture: false};}},
    {corrupt: true}, {mode: 'exists'}, {mode: 'registry-fails'},
    {undated: true}, {staleReport: true},
  ];
  for (const input of scenarios) {
    const result = await attempt(input);
    assert.notEqual(result.code, 0, JSON.stringify(input));
    assert.match(result.stderr, /AssertionError/, 'the documented gate must refuse, not an unrelated process or setup error');
    assert.deepEqual(result.recorded.filter(c => c.command === 'gh' || c.args[0] === 'publish'), [], 'a refusal performs no publication/release write');
  }
});

test('publication persists the tested archive first and exposes the release only after npm confirms its integrity', async () => {
  const result = await attempt();
  assert.equal(result.code, 0, result.stderr);
  const draft = result.recorded.find(c => c.command === 'gh' && c.args[1] === 'create')!;
  for (const asset of ['rayner-0.1.1.tgz', 'manifest.json', 'validation/browser-review.json', 'validation/page-budgets.json', 'validation/native-safari.json', 'validation/webkit.json'])
    assert.ok(draft.args.includes('out/release/' + asset), `preserve ${asset}`);
  assert.ok(draft.args.includes('--draft'));
  assert.equal(draft.args.includes('--clobber'), false);
  assert.deepEqual(result.recorded.find(c => c.command === 'npm' && c.args[0] === 'publish')?.args,
    ['publish', 'out/release/rayner-0.1.1.tgz', '--tag', 'latest']);
  const candidate = await attempt({env: {NPM_DIST_TAG: 'next'}});
  assert.equal(candidate.code, 0, candidate.stderr);
  assert.deepEqual(candidate.recorded.find(c => c.command === 'npm' && c.args[0] === 'publish')?.args,
    ['publish', 'out/release/rayner-0.1.1.tgz', '--tag', 'next']);
  assert.deepEqual(result.recorded.filter(c => c.args[0] !== '--version').map(c => [c.command, ...c.args.slice(0, 2)]), [
    ['gh', 'release', 'create'], ['npm', 'publish', 'out/release/rayner-0.1.1.tgz'], ['gh', 'release', 'edit'],
  ]);
  const draftFailure = await attempt({mode: 'draft-fails'});
  assert.notEqual(draftFailure.code, 0);
  assert.equal(draftFailure.recorded.some(c => c.args[0] === 'publish'), false, 'cannot publish without preserving evidence first');
  const corruptRegistry = await attempt({mode: 'wrong-bytes'});
  assert.notEqual(corruptRegistry.code, 0);
  assert.equal(corruptRegistry.recorded.some(c => c.command === 'gh' && c.args[1] === 'edit'), false, 'do not expose a release whose registry bytes differ');
});
