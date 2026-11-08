// The bare runtime `rayner check` runs: one bundle per project, the page's font path, a fresh context per scenario.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'esbuild';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { bareRuntime } from '../tools/lib/explain-check.ts';

const folder = await mkdtemp(join(tmpdir(), 'rayner-bare-'));
after(() => rm(folder, { recursive: true, force: true }));

test('one bundle runs every scenario, each in a context of its own, and reproduces its trace', async () => {
  const dir = join(folder, 'counter');
  await mkdir(dir);
  // A module-level counter: a scenario run in the context another ran in would count on from it.
  await writeFile(join(dir, 'scene.ts'), `import{Scene,Text}from'rayner';import{stage,settingsOf}from'rayner/explain';let runs=0;
export default class Counter extends Scene{static settings=[{id:'size',label:'Size',default:'small',options:[{value:'small',label:'Small'},{value:'large',label:'Large'}]}];
async construct(){const s=stage(this);const size=settingsOf(this).size;await this.step('one',{caption:'A label.'});this.state.runs=++runs;this.state.size=size;
await s.enter(new Text(size,{fontSize:.4}),{describe:'the size'});await this.wait(size==='large'?2:1);}}`);
  const project = await collectProject(dir, { write: false });
  assert.equal(project.scenarios.length, 2);
  const builds: string[] = [];
  const counting: Plugin = { name: 'count-builds', setup(b) { b.onStart(() => { builds.push('build'); }); } };
  const run = await bareRuntime(project, [counting]);
  for (const v of project.scenarios) {
    const { trace } = await run(v.values) as { trace: { steps: { after: { runs: number } }[] } };
    // Node ran the module's scenes in one process, so its count runs on; each bare run starts at 1.
    assert.equal(trace.steps[0]!.after.runs, 1, JSON.stringify(v.values));
    const node = JSON.parse(JSON.stringify(v.trace));
    node.steps[0].after.runs = 1;
    assert.deepEqual(trace, node, JSON.stringify(v.values));
  }
  assert.equal(builds.length, 1, 'bundled once for both scenarios');
});

test('the bare runtime shapes with the page\'s SFNT faces, without the Brotli decoder', async () => {
  const project = await collectProject(join(ROOT, 'scenes/explainers/font-metrics/scene.ts'), { write: false });
  let code = '';
  const capture: Plugin = { name: 'capture', setup(b) { b.onEnd((r) => { code = r.outputFiles?.[0]?.text ?? ''; }); } };
  const run = await bareRuntime(project, [capture]);
  assert.ok(code.length > 0 && !code.includes('large-window brotli'));
  const v = project.scenarios[0]!;
  assert.deepEqual((await run(v.values)).trace, JSON.parse(JSON.stringify(v.trace)));
});
