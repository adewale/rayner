// The trace as the player reads it: one shape for the default scenario the build ships and for
// every scenario the page runs, keeping only the watched state.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProject } from '../tools/lib/explain-project.ts';
import { bareRuntime } from '../tools/lib/explain-check.ts';
import { shippedScenario } from '../tools/lib/scene-entry.ts';
import { playerChanges, playerTrace, type PlayerStep } from '../app/embed-trace.ts';
import type { Trace } from '../src/trace.ts';

const folder = await mkdtemp(join(tmpdir(), 'rayner-player-trace-'));
after(() => rm(folder, { recursive: true, force: true }));

/** A scene that watches one key, keeps another it does not watch, and records evidence; two scenarios. */
async function watchingProject() {
  const dir = join(folder, 'watching');
  await mkdir(dir);
  await writeFile(join(dir, 'scene.ts'), `import{Scene,Text}from'rayner';import{stage,settingsOf}from'rayner/explain';
export default class Watching extends Scene{static meta={watch:{count:'Count'}};
static settings=[{id:'size',label:'Size',default:'small',options:[{value:'small',label:'Small'},{value:'large',label:'Large'}]}];
async construct(){const s=stage(this);const size=settingsOf(this).size;this.state.count=0;this.state.points=[[0,0],[1,1]];
await this.step('one',{caption:'A label.'});this.state.count=1;this.record('note',{size});
await s.enter(new Text(size,{fontSize:.4}),{describe:'the size'});await this.wait(1);
await this.step('two',{caption:'Another.'});this.state.count=size==='large'?3:2;await this.wait(1);}}`);
  return collectProject(dir, { write: false });
}

const PLAYER_KEYS = new Set(['step', 't0', 'frame0', 't1', 'frame1', 'hold', 'holdFrame', 'meta', 'shown', 'before', 'after']);

test('the shipped scenario and a scenario the page runs give the player one trace shape: watched state only, no evidence', async () => {
  const project = await watchingProject();
  assert.equal(project.scenarios.length, 2);
  const watch = project.Scene.meta?.watch;
  const run = await bareRuntime(project);
  for (const v of project.scenarios) {
    const full = v.trace as Trace;
    assert.ok(full.steps.some((s) => s.evidence?.length), 'the build\'s trace has evidence to leave out');
    assert.ok(full.steps.some((s) => Object.hasOwn(s.after ?? {}, 'points')), 'and state the scene does not watch');
    const shipped = shippedScenario(project, v).trace;
    // The page's own run of the scenario (its entry, in the bare runtime), as the player prunes it.
    const page = playerTrace((await run(v.values)).trace as Trace, watch);
    assert.deepEqual(JSON.parse(JSON.stringify(page)), JSON.parse(JSON.stringify(shipped)), JSON.stringify(v.values));
    for (const step of shipped.steps) {
      assert.deepEqual(Object.keys(step).filter((k) => !PLAYER_KEYS.has(k)), [], `${step.step}: only the player's keys`);
      for (const state of [step.before, step.after]) assert.deepEqual(Object.keys(state ?? {}), ['count'], `${step.step}: only the watched key`);
    }
    assert.deepEqual(shipped.steps.map((s) => playerChanges(s, watch)), [[{ label: 'Count', before: '0', after: '1' }], [{ label: 'Count', before: '1', after: v.values.size === 'large' ? '3' : '2' }]]);
  }
});

test('a scene that watches nothing gives the player no state at all', () => {
  const trace: Trace = { fps: 30, duration: 1, frames: 30, steps: [{ step: 'a', t0: 0, frame0: 0, t1: 1, frame1: 30, meta: {}, before: { x: 1 }, after: { x: 2 }, evidence: [{ kind: 'k' }] }] };
  assert.deepEqual(playerTrace(trace, undefined), { fps: 30, duration: 1, frames: 30, steps: [{ step: 'a', t0: 0, frame0: 0, t1: 1, frame1: 30, meta: {}, before: {}, after: {} }] });
});

test('the player cannot read a step\'s state except through its watched changes', () => {
  const step = playerTrace({ fps: 30, duration: 0, frames: 0, steps: [{ step: 'a', t0: 0, frame0: 0, meta: {}, before: { x: 1 } }] }, { x: 'X' }).steps[0]! satisfies PlayerStep;
  // @ts-expect-error the watched state is opaque: a key is read through playerChanges, never directly
  assert.equal(step.before.x, 1);
});
