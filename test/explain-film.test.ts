import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectProject} from '../tools/lib/explain-project.ts';
import {filmProject, midplayFrames, reviewContactSheet} from '../tools/lib/explain-film.ts';

test('film visits every scenario and reachable accepted/refused press, preserving comma labels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-film-'));
  try {
    await writeFile(join(dir, 'scene.ts'), `import{Scene,Text,Group,keyed}from'rayner';import{Machine,stage,view,refuse}from'rayner/explain';
export default class Film extends Scene{static meta={id:"film"};static settings=[{id:'case',label:'Case',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];state={on:false};async construct(){const s=stage(this,{heading:false});await this.step('try');const v=view(this,st=>new Group(keyed(new Text(st.on?'On':'Off',{fontSize:.6}),'word')));s.keep(v);const m=new Machine(this,{start:{on:false},events:['go','blocked'],labels:{'go':'Go, now'},next:(st,e)=>e==='blocked'?refuse('No permission'):{on:true},views:[v],runTime:.2});await m.send('go');}}`);
    const project = await collectProject(dir, {write:false});
    const output = join(dir, 'output');
    const result = await filmProject(project, output);
    assert.equal(result.films.length, 6, 'two scenarios, one live origin with two presses each');
    assert.equal(result.films.filter(f => f.event === 'go').length, 2);
    assert.equal(result.films.filter(f => f.name.includes('Go, now')).length, 2);
    const refused = result.films.filter(f => f.event === 'blocked');
    assert.equal(refused.length, 2);
    assert.ok(refused.every(f => JSON.stringify(f.outcome).includes('No permission') && f.frames.length));
    assert.ok(result.frames > result.films.length, 'motion has intermediate samples');
    const manifest = JSON.parse(await readFile(join(output, 'film.json'), 'utf8'));
    assert.equal(manifest.films.length, 6);
    const frames = await readdir(join(output, 'frames', manifest.generation));
    assert.equal(frames.filter(f => f.endsWith('.png')).length, result.frames);
    await writeFile(join(output, 'frames/stale.png'), 'stale');
    await filmProject(project, output);
    assert.equal(await readFile(join(output, 'frames/stale.png'), 'utf8'), 'stale', 'unowned files survive publication');
    assert.ok(!(await readdir(join(output, 'frames'))).includes(manifest.generation), 'only the old owned generation is retired');
    await midplayFrames(project.scenarios[0]!, output);
    for (const n of [1, 2]) assert.ok((await readFile(join(output, `try.mid${n}.png`))).length > 100);
    await reviewContactSheet(output);
    assert.match(await readFile(join(output, 'phone-views.html'), 'utf8'), /native stage samples/);
  } finally {await rm(dir, {recursive:true,force:true});}
});

test('a publication lock left by a dead or crashed film is recovered; a live one is waited for', async () => {
  const {acquirePublishLock} = await import('../tools/lib/explain-film.ts');
  const {mkdir, utimes, stat} = await import('node:fs/promises');
  const {hostname} = await import('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'rayner-film-lock-'));
  try {
    const lock = join(dir, '.film-publish.lock');
    // A holder on this host whose process has exited: taken over at once.
    await mkdir(lock);
    await writeFile(join(lock, 'owner.json'), JSON.stringify({token: 'dead', pid: 2 ** 22 + 12345, host: hostname(), created: Date.now()}));
    const release = await acquirePublishLock(lock, {wait: 1000});
    assert.equal(JSON.parse(await readFile(join(lock, 'owner.json'), 'utf8')).pid, process.pid);
    await release();
    await assert.rejects(stat(lock), {code: 'ENOENT'});
    // A bare directory, as an earlier version left it, older than a holder needs to record itself.
    await mkdir(lock);
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    await (await acquirePublishLock(lock, {wait: 1000}))();
    // A live holder: the second publisher waits, then takes the lock once it is released.
    const first = await acquirePublishLock(lock);
    let second: Promise<() => Promise<void>> | undefined;
    let took = false;
    second = acquirePublishLock(lock, {wait: 5000}).then((r) => { took = true; return r; });
    await new Promise((done) => setTimeout(done, 200));
    assert.equal(took, false, 'a live lock is not taken over');
    await first();
    await (await second)();
    // Waiting is bounded, and the error names the lock.
    const held = await acquirePublishLock(lock);
    await assert.rejects(acquirePublishLock(lock, {wait: 100}), /another rayner film is publishing.*film-publish\.lock/);
    await held();
  } finally { await rm(dir, {recursive: true, force: true}); }
});
