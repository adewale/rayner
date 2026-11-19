import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {defaultScene} from './lib/scenes.ts';
import {collectProject, defaultScenario, ROOT} from '../tools/lib/explain-project.ts';
import {Scene} from '../src/index.ts';
import type {SceneClass} from '../src/index.ts';
import {renderElements, toSvgString} from '../src/svg.ts';
import {traceRun} from '../src/trace.ts';

// Same caption policy as the cache oracle; the frames compared below still include every play.
Scene.captionWpm = Infinity;

test('default fixtures select the declared default without executing unrelated scenarios; collection still checks all', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-default-fixture-'));
  try {
    await writeFile(join(folder, 'scene.ts'), `import {Scene,Text} from 'rayner'; import {settingsOf} from 'rayner/explain';
export default class Fixture extends Scene {
 static meta={id:'default-fixture'};
 static settings=[{id:'choice',label:'Choice',default:'right',options:[{value:'wrong',label:'Wrong'},{value:'right',label:'Right'}]}];
 async construct(){const value=settingsOf(this).choice;if(value!=='right')throw new Error('nondefault scenario ran');await this.step('one');this.state={value};this.add(new Text(value));await this.wait(1/30);}
}`);
    const Bound = await defaultScene(folder);
    const {trace} = await traceRun(Bound);
    assert.equal(trace.steps.at(-1)!.after.value, 'right');
    await assert.rejects(collectProject(folder, {write: false}), /nondefault scenario ran/);
  } finally { await rm(folder, {recursive: true, force: true}); }
});

async function rendered(Source: SceneClass, relative: boolean) {
  const hash = createHash('sha256');
  let frames = 0;
  await new Source({async frame(scene) {
    hash.update(relative ? toSvgString(scene) : JSON.stringify(renderElements(scene, {relative: false}).map(e => [e.tag, e.attrs, e.transform, e.text, e.clipBox])));
    frames++;
  }}).run();
  return {frames, sha256: hash.digest('hex')};
}

for (const id of ['python-dict', 'trust-proxy', 'font-metrics']) test(`${id}: default-only setup preserves traced state, snapshots, lettering and every rendered frame in both modes`, async () => {
  const input = join(ROOT, 'scenes/explainers', id);
  const project = await collectProject(input, {write: false});
  const old = defaultScenario(project), Bound = await defaultScene(input);
  assert.deepEqual((await traceRun(Bound)).trace, old.trace);
  for (const relative of [true, false])
    assert.deepEqual(await rendered(Bound, relative), await rendered(old.Scene, relative), `${id}/${relative}`);
});
