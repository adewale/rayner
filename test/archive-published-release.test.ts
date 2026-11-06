import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
const script = new URL('../tools/repo/archive-published-release.ts', import.meta.url).pathname;
type Release = {id: number; tag_name: string; draft: boolean; assets: unknown[]};
const draft = (id = 5): Release => ({id, tag_name: 'v0.1.0', draft: true, assets: []});

async function attempt(releases: Release[], mode = '', env = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-archive-guard-'));
  try {
    const bin = join(folder, 'bin'), calls = join(folder, 'calls.jsonl'), state = join(folder, 'releases.json');
    await mkdir(bin); await mkdir(join(folder, 'tools'));
    await writeFile(join(bin, 'package.json'), '{"type":"commonjs"}');
    await writeFile(join(folder, 'package.json'), JSON.stringify({name: 'rayner', version: '0.1.0', type: 'module'}));
    await writeFile(join(folder, 'tools/explain-package-smoke.ts'), "console.log('Installed package gates passed.');\n");
    await writeFile(state, JSON.stringify(releases));
    const bytes = Buffer.from('original public npm archive');
    const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    // Only these executables can serve git/npm/gh requests. No actual credential,
    // npm publication, release mutation or remote connection is available here.
    const common = `const fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2),mode=process.env.ARCHIVE_MODE;fs.appendFileSync(process.env.ARCHIVE_CALLS,JSON.stringify({command:NAME,args})+'\\n');`;
    const scripts = {
      git: `if(args[0]==='rev-parse')console.log((mode==='wrong-tag'&&args[1]!=='HEAD'?'b':'a').repeat(40));else if(args[0]==='status')console.log(mode==='dirty'?' M source.ts':'');else process.exit(10);`,
      npm: `if(args[0]==='view')console.log(JSON.stringify({integrity:${JSON.stringify(integrity)}}));else if(args[0]==='pack'){const dir=args[args.indexOf('--pack-destination')+1];fs.writeFileSync(path.join(dir,'rayner-0.1.0.tgz'),mode==='corrupt'?'wrong':${JSON.stringify(bytes.toString())});console.log(JSON.stringify([{filename:'rayner-0.1.0.tgz'}]));}else process.exit(11);`,
      gh: `let releases=JSON.parse(fs.readFileSync(process.env.ARCHIVE_STATE,'utf8'));if(args[0]==='api'&&args.includes('--paginate')&&args.includes('.[] | @json')){if(mode==='list-fails'){console.error('HTTP 503');process.exit(12);}for(const r of releases)console.log(JSON.stringify(r));}else if(args[0]==='release'&&args[1]==='create'){releases.push({id:20,tag_name:'v0.1.0',draft:true,assets:[]});if(mode==='creation-race')releases.push({id:21,tag_name:'v0.1.0',draft:true,assets:[]});fs.writeFileSync(process.env.ARCHIVE_STATE,JSON.stringify(releases));}else if(args[0]==='release'&&['upload','edit'].includes(args[1])){}else{console.error('Unexpected command; tag lookup deliberately cannot see drafts');process.exit(13);}`,
    };
    for (const [name, body] of Object.entries(scripts)) {
      const executable = join(bin, name);
      await writeFile(executable, `#!${process.execPath}\nconst NAME=${JSON.stringify(name)};${common}${body}\n`); await chmod(executable, 0o755);
    }
    let code = 0, stderr = '';
    try { await run(process.execPath, [script], {cwd: folder, env: {...process.env, PATH: bin + ':' + process.env.PATH, ARCHIVE_CALLS: calls, ARCHIVE_STATE: state, ARCHIVE_MODE: mode, ARCHIVE_SOURCE: folder, ARCHIVE_VERSION: '0.1.0', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'adewale/rayner', EXPLAIN_BROWSER: '1', EXPLAIN_LETTERING: '1', ...env}}); }
    catch (error) {code = Number((error as {code: number}).code); stderr = (error as {stderr: string}).stderr;}
    const recorded = (await readFile(calls, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as {command: string; args: string[]});
    return {code, stderr, recorded, releases: JSON.parse(await readFile(state, 'utf8')) as Release[]};
  } finally {await rm(folder, {recursive: true, force: true});}
}

const writes = (result: Awaited<ReturnType<typeof attempt>>) => result.recorded.filter(c => c.command === 'gh' && c.args[0] === 'release');

test('retrospective archival reuses the unique empty draft from the complete list instead of creating a duplicate', async () => {
  // An unrelated public release must not hide a draft later in the paginated list.
  const result = await attempt([{...draft(1), tag_name: 'v0.0.9', draft: false}, draft()]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(writes(result).map(c => c.args.slice(0, 3)), [['release', 'upload', 'v0.1.0'], ['release', 'edit', 'v0.1.0']]);
  assert.ok(result.recorded.some(c => c.command === 'gh' && c.args.includes('--paginate')));
  assert.equal(result.releases.length, 2);
  const upload = writes(result)[0]!;
  assert.equal(upload.args.includes('--clobber'), false);
  assert.ok(upload.args.some(p => p.endsWith('rayner-0.1.0.tgz')));
  assert.ok(upload.args.some(p => p.endsWith('published-manifest.json')));
  assert.ok(upload.args.some(p => p.endsWith('package-validation.log')));
});

test('retrospective archival creates one draft only when none exists, then confirms its unique identity before uploading', async () => {
  const result = await attempt([]); assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.recorded.filter(c => c.command === 'gh').map(c => c.args.slice(0, 2)), [['api', '--paginate'], ['release', 'create'], ['api', '--paginate'], ['release', 'upload'], ['release', 'edit']]);
  assert.equal(result.releases.length, 1); assert.ok(writes(result)[0]!.args.includes('--verify-tag'));
  const raced = await attempt([], 'creation-race'); assert.notEqual(raced.code, 0); assert.match(raced.stderr, /multiple release records match v0.1.0/);
  assert.deepEqual(writes(raced).map(c => c.args[1]), ['create'], 'ambiguous post-create state must not receive assets or publication');
});

test('retrospective archival refuses public, duplicate, nonempty and failed lookups before any release mutation', async () => {
  const cases = [
    {releases: [draft(), draft(6)], error: /multiple release records match/},
    {releases: [{...draft(), draft: false}, draft(6)], error: /multiple release records match/},
    {releases: [{...draft(), draft: false}], error: /do not alter an existing public release/},
    {releases: [{...draft(), assets: [{id: 99}]}], error: /do not overwrite previously retained release evidence/},
    {releases: [], mode: 'list-fails', error: /HTTP 503/},
  ];
  for (const input of cases) {
    const result = await attempt(input.releases, input.mode);
    assert.notEqual(result.code, 0); assert.match(result.stderr, input.error); assert.deepEqual(writes(result), []);
  }
});

test('retrospective archival retains original source and archive guards without invoking npm publish or changing tags', async () => {
  for (const mode of ['wrong-tag', 'dirty', 'corrupt']) {
    const result = await attempt([], mode); assert.notEqual(result.code, 0, mode); assert.match(result.stderr, /AssertionError/, mode); assert.deepEqual(writes(result), []);
  }
  const result = await attempt([]);
  assert.equal(result.recorded.some(c => c.command === 'npm' && c.args[0] === 'publish'), false);
  assert.deepEqual(result.recorded.filter(c => c.command === 'git').map(c => c.args[0]), ['rev-parse', 'rev-parse', 'status', 'status']);
});
