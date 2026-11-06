import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
const script = new URL('../tools/repo/publish-release.ts', import.meta.url).pathname;

type Manifest = Record<string, unknown> & {packages: {name: string; filename: string; integrity: string}[]};
async function attempt({env = {}, change = (m: Manifest) => {}, corrupt = '', mode = '', undated = false, staleReport = false} = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-publish-guard-'));
  try {
    const directory = join(folder, 'out/release'), bin = join(folder, 'bin');
    await mkdir(directory, {recursive: true}); await mkdir(bin);
    const packages = ['rayner', 'rayner-cli'].map(name => {
      const bytes = Buffer.from(`the reviewed ${name} archive`);
      return {name, filename: `${name}-0.1.1.tgz`, bytes, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64')};
    });
    const manifest: Record<string, unknown> & {packages: {name: string; filename: string; integrity: string}[]} = {version: '0.1.1', sourceCommit: 'a'.repeat(40), dirty: false, gates: {package: true, browser: true, letteringCapture: true},
      packages: packages.map(({name, filename, integrity}) => ({name, filename, integrity}))};
    change(manifest);
    for (const p of packages) await writeFile(join(directory, p.filename), corrupt === p.name ? 'changed archive' : p.bytes);
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
    // The registry: each version is first looked up (404 unless RELEASE_MODE says otherwise), then
    // read back after publication with the integrity npm serves.
    const served = Object.fromEntries(packages.map(p => [p.name, p.integrity]));
    await writeFile(preload, `const seen=new Set(),served=${JSON.stringify(served)};globalThis.fetch=async(url)=>{const name=new URL(url).pathname.split('/')[1];const mode=process.env.RELEASE_MODE;if(!seen.has(name)){seen.add(name);return new Response('{}',{status:mode===name+'-exists'?200:mode==='registry-fails'?503:404});}return Response.json({dist:{integrity:mode===name+'-wrong-bytes'?'wrong':served[name]}});};`);
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
    {env: {NPM_DIST_TAG: 'unexpected'}}, {change: (m: Manifest) => {m.dirty = true;}},
    {change: (m: Manifest) => {m.version = '0.2.0';}},
    {change: (m: Manifest) => {m.packages[0]!.filename = '../other.tgz';}},
    {change: (m: Manifest) => {m.packages[1]!.filename = '../other.tgz';}},
    {change: (m: Manifest) => {m.packages.pop();}},
    {change: (m: Manifest) => {m.packages.reverse();}},
    {change: (m: Manifest) => {m.gates = {package: true, browser: false, letteringCapture: true};}},
    {change: (m: Manifest) => {m.gates = {package: true, browser: true, letteringCapture: false};}},
    {corrupt: 'rayner'}, {corrupt: 'rayner-cli'}, {mode: 'rayner-exists'}, {mode: 'rayner-cli-exists'}, {mode: 'registry-fails'},
    {undated: true}, {staleReport: true},
  ];
  for (const input of scenarios) {
    const result = await attempt(input);
    assert.notEqual(result.code, 0, JSON.stringify(input));
    assert.match(result.stderr, /AssertionError/, 'the documented gate must refuse, not an unrelated process or setup error');
    assert.deepEqual(result.recorded.filter(c => c.command === 'gh' || c.args[0] === 'publish'), [], 'a refusal performs no publication/release write');
  }
});

test('publication persists the tested archives first, publishes the library before the command and exposes the release only after npm confirms both', async () => {
  const result = await attempt();
  assert.equal(result.code, 0, result.stderr);
  const draft = result.recorded.find(c => c.command === 'gh' && c.args[1] === 'create')!;
  for (const asset of ['rayner-0.1.1.tgz', 'rayner-cli-0.1.1.tgz', 'manifest.json', 'validation/browser-review.json', 'validation/page-budgets.json', 'validation/native-safari.json', 'validation/webkit.json'])
    assert.ok(draft.args.includes('out/release/' + asset), `preserve ${asset}`);
  assert.ok(draft.args.includes('--draft'));
  assert.equal(draft.args.includes('--clobber'), false);
  assert.deepEqual(result.recorded.filter(c => c.command === 'npm' && c.args[0] === 'publish').map(c => c.args),
    [['publish', 'out/release/rayner-0.1.1.tgz', '--tag', 'latest'], ['publish', 'out/release/rayner-cli-0.1.1.tgz', '--tag', 'latest']]);
  const candidate = await attempt({env: {NPM_DIST_TAG: 'next'}});
  assert.equal(candidate.code, 0, candidate.stderr);
  assert.deepEqual(candidate.recorded.filter(c => c.command === 'npm' && c.args[0] === 'publish').map(c => c.args),
    [['publish', 'out/release/rayner-0.1.1.tgz', '--tag', 'next'], ['publish', 'out/release/rayner-cli-0.1.1.tgz', '--tag', 'next']]);
  assert.deepEqual(result.recorded.filter(c => c.args[0] !== '--version').map(c => [c.command, ...c.args.slice(0, 2)]), [
    ['gh', 'release', 'create'], ['npm', 'publish', 'out/release/rayner-0.1.1.tgz'], ['npm', 'publish', 'out/release/rayner-cli-0.1.1.tgz'], ['gh', 'release', 'edit'],
  ]);
  const draftFailure = await attempt({mode: 'draft-fails'});
  assert.notEqual(draftFailure.code, 0);
  assert.equal(draftFailure.recorded.some(c => c.args[0] === 'publish'), false, 'cannot publish without preserving evidence first');
  for (const name of ['rayner', 'rayner-cli']) {
    const corruptRegistry = await attempt({mode: `${name}-wrong-bytes`});
    assert.notEqual(corruptRegistry.code, 0);
    assert.equal(corruptRegistry.recorded.some(c => c.command === 'gh' && c.args[1] === 'edit'), false, `do not expose a release whose ${name} registry bytes differ`);
  }
  const libraryWrong = await attempt({mode: 'rayner-wrong-bytes'});
  assert.equal(libraryWrong.recorded.some(c => c.args[0] === 'publish' && c.args[1]!.includes('rayner-cli')), false, 'do not publish the command over a library npm does not serve as tested');
});
