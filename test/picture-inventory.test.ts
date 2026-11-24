import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scene, Rectangle, Group, keyed } from '../src/index.ts';
import { NullSink } from '../src/timeline.ts';
import { Machine, stage, view } from '../explain/index.ts';
import { pictureInventory, picturePath } from '../tools/lib/explain-picture-inventory.ts';
import { exploreMachines } from '../tools/lib/explain-check.ts';
import { collectProject } from '../tools/lib/explain-project.ts';
import { filmProject } from '../tools/lib/explain-film.ts';
import { liveSubjects } from '../tools/lib/explain-live-review.ts';
import { loadFonts } from '../explain/testing.ts';
import { keyedMotionFindings, type Found } from '../tools/repo/motion-corpus-lib.ts';
import { rasterize } from '../tools/lib/explain-raster.ts';

test('bounded presentation inventory evaluates each incoming result once, retains legal paths and reports truncation', () => {
  let calls = 0;
  const machine = new Machine<{n: number}, 'next'>(Object.assign(new Scene(new NullSink()), {state: {n: 0}}), {start: {n: 0}, limit: 256, views: [], events: ['next'],
    next: s => s.n < 255 ? {n: s.n + 1} : undefined,
    result: ({after}) => { calls++; return {n: after.n}; },
  });
  const graph = pictureInventory(machine as never, [{state: {n: 0}, shown: {}}, {state: {n: 0}, shown: {}}]);
  assert.equal(graph.states, 256);
  assert.equal(graph.origins.length, 256);
  assert.equal(graph.edges.length, 256);
  assert.equal(graph.complete, true);
  assert.equal(calls, 255, 'duplicate roots do not reevaluate a pure result or any history prefix');
  assert.deepEqual(picturePath(graph.origins.at(-1)!), Array(255).fill('next'));
  const capped = new Machine<{n: number}, 'next'>(Object.assign(new Scene(new NullSink()), {state: {n: 0}}), {start: {n: 0}, limit: 2, views: [], events: ['next'], next: s => ({n: s.n + 1})});
  const partial = pictureInventory(capped as never, [{state: {n: 0}, shown: {}}]);
  assert.equal(partial.states, 2);
  assert.equal(partial.complete, false);
  assert.ok(partial.edges.some(e => 'next' in e.outcome && !e.to));
});

test('public checker enumerates bounded pictures without replaying result histories', async () => {
  await loadFonts();
  let calls = 0;
  class Chain extends Scene {
    override state = {n: 0};
    override async construct() {
      const s = stage(this, {heading: false});
      const picture = view(this, () => new Group(keyed(new Rectangle({width: 1, height: 1}), 'mark')));
      s.keep(picture, {describe: () => `position ${this.state.n}`});
      const machine = new Machine(this, {start: this.state, limit: 256, views: [picture], events: ['next'],
        next: st => st.n < 255 ? {n: st.n + 1} : undefined,
        result: ({after}) => { calls++; return {n: after.n}; },
      });
      await this.step('offer'); machine.offer();
    }
  }
  const scene = await new Chain(new NullSink()).run();
  const [checked] = await exploreMachines(scene, Chain, new Map(), {events: []});
  assert.equal(checked!.states, 256);
  assert.equal(checked!.presentations, 256);
  assert.equal(checked!.transitions, 0);
  assert.equal(calls, 255);
});

const responseScene = (fails: boolean) => `import{Scene,Group,Rectangle,keyed}from'rayner';import{Machine,view,stage}from'rayner/explain';
export default class Responses extends Scene{static meta={id:'responses'};state={ready:true};shown={result:{color:'#00ff00'}};
async construct(){const s=stage(this,{heading:false});const picture=view(this,(_st,sh)=>new Group(keyed(new Rectangle({width:2,height:2,fill:sh.result?.color??'#00ff00',stroke:'none'}),'mark')));
s.keep(picture,{describe:()=> 'response'});const machine=new Machine(this,{start:this.state,views:[picture],events:['red','blue'],next:st=>({...st}),runTime:.2,
result:({event})=>({color:event==='red'?'#ff0000':'#0000ff'}),${fails ? "transition:{blue:()=>{throw new Error('interrupted reader event')}}," : ''}});
await this.step('offer');machine.offer();await this.wait(.1);}}`;

test('film and served-review planning retain every immediate response and films each picture edge; a failed rerun preserves the published generation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-picture-origins-'));
  try {
    const source = join(dir, 'scene.ts'), output = join(dir, 'film');
    await writeFile(source, responseScene(false));
    const project = await collectProject(source, {write: false});
    const Source = project.scenarios[0]!.Scene;
    const [checked] = await exploreMachines(await new Source(new NullSink()).run(), Source, new Map());
    assert.equal(checked!.states, 1);
    assert.equal(checked!.presentations, 4, 'machine start without a result, historical green, red and blue are separate inputs');
    assert.equal(checked!.transitions, 8);
    const subjects = await liveSubjects(project.scenarios[0]!);
    assert.deepEqual(subjects.map(s => s.sent), [['red'], ['blue']], 'each distinct immediate response is mandatory');
    const result = await filmProject(project, output);
    assert.equal(result.films.length, 7, 'one story plus both presses from green, red and blue');
    const redToBlue = result.films.find(f => f.event === 'blue' && JSON.stringify(f.path) === '["red"]');
    assert.ok(redToBlue);
    const before = await readFile(join(output, 'frames', redToBlue.frames[0]!.svg), 'utf8');
    const after = await readFile(join(output, 'frames', redToBlue.frames.at(-1)!.svg), 'utf8');
    assert.match(before, /#ff0000/); assert.match(after, /#0000ff/);
    for (const [svg, color] of [[before, [255, 0, 0]], [after, [0, 0, 255]]] as const) {
      const frame = await rasterize(svg), middle = 4 * (Math.floor(frame.height / 2) * frame.width + Math.floor(frame.width / 2));
      assert.deepEqual([...frame.pixels.subarray(middle, middle + 3)], color, 'the captured native frames paint the incoming and outgoing replies');
    }
    const manifest = await readFile(join(output, 'film.json')), index = await readFile(join(output, 'index.html'));
    await writeFile(join(output, 'frames/notes.txt'), 'user evidence');
    const generations = await readdir(join(output, 'frames'));
    await writeFile(source, responseScene(true));
    const failed = await collectProject(source, {write: false});
    await assert.rejects(filmProject(failed, output), /interrupted reader event/);
    assert.deepEqual(await readFile(join(output, 'film.json')), manifest);
    assert.deepEqual(await readFile(join(output, 'index.html')), index);
    assert.deepEqual(await readdir(join(output, 'frames')), generations);
    assert.equal(await readFile(join(output, 'frames/notes.txt'), 'utf8'), 'user evidence');
    for (const film of result.films) for (const frame of film.frames)
      assert.ok((await readFile(join(output, 'frames', frame.png))).length > 100, 'every retained manifest entry remains readable');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('a later reader failure retains the earlier independently observed motion diagnosis', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-partial-motion-'));
  try {
    const source = join(dir, 'scene.ts');
    const text = responseScene(false).replace('runTime:.2,', `runTime:.2,
motion:({event})=>event==='red'?[{view:picture,during:'parcel',present:['mark']}]:[],
transition:{red:t=>t.choreograph(picture).rest({runTime:.1}),blue:()=>{throw new Error('later reader failure')}},`);
    await writeFile(source, text);
    const observed: Found[] = [];
    await assert.rejects(keyedMotionFindings(source, undefined, observed), /later reader failure/);
    assert.ok(observed.some(f => f.observation?.type === 'finding' && f.observation.path === 'parcel' && f.observation.transition.endsWith('red')),
      'the earlier motion contract is retained when the next event aborts');
  } finally { await rm(dir, {recursive: true, force: true}); }
});
