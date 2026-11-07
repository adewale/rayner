// One seeded defect per gate, through the entry points `rayner check` uses:
// collectProject (load, scenarios, named steps, drawable text) and checkProject
// (every check on every scenario). Each scene breaks exactly one rule and must fail
// with that gate's own message; the clean scene shows the same shape passes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectProject, writeSnapshots, ROOT } from '../tools/lib/explain-project.ts';
import { checkProject } from '../tools/lib/explain-check.ts';
import { scenariosOf, resolveSettings } from '../explain/settings.ts';
import { diagramKey } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { fixedSnapshot, square } from './lib/random-snapshot.ts';

const folder = await mkdtemp(join(tmpdir(), 'rayner-gates-'));
after(() => rm(folder, { recursive: true, force: true }));

const HEAD = `import{Scene,Text,Dot,Rectangle,Line,FadeIn}from'rayner';import{stage,settingsOf}from'rayner/explain';`;
/** A scene module: `pre` at module level, `body` inside construct() after `const s=stage(this)`. */
const scene = (body: string, pre = '', statics = '') =>
  `${HEAD}${pre}export default class Seeded extends Scene{${statics}async construct(){const s=stage(this);${body}}}`;
const label = (words: string, at = '[0,0]', size = 0.4) =>
  `await s.enter(new Text(${JSON.stringify(words)},{fontSize:${size}}).moveTo(${at}),{describe:${JSON.stringify(words)}});`;

let n = 0;
async function write(source: string, snapshots?: Record<string, DiagramSnapshot>): Promise<string> {
  const dir = join(folder, String(n++));
  await mkdir(dir);
  await writeFile(join(dir, 'scene.ts'), source);
  if (snapshots) await writeSnapshots(join(dir, 'scene'), snapshots);
  return dir;
}
const checked = async (dir: string) => checkProject(await collectProject(dir, { write: false }), join(dir, 'checks'));

test('a clean scene passes every gate', async () => {
  const report = await checked(await write(scene(`await this.step('one',{caption:'A label.'});${label('hello')}await this.step('two',{caption:'Another.'});${label('world', '[0,-2]')}`)));
  assert.equal((report.scenarios as unknown[]).length, 1);
});

test('numerals outside Latin draw from the fallback faces and pass every gate, in sans and mono', async () => {
  const report = await checked(
    await write(
      scene(
        `await this.step('one',{caption:'Numerals.'});${label('٣ ۳ ३ ３ 三 Ⅻ ² ½ ①')}await this.step('two',{caption:'In code.'});await s.enter(new Text('n = int("٣") # 三 Ⅻ',{fontSize:.4,font:'mono'}).moveTo([0,-2]),{describe:'code'});`,
      ),
    ),
  );
  assert.equal((report.scenarios as unknown[]).length, 1);
});

// A diagram whose label B is readable only in mid-sweep: enlarge(['B']) zooms to it, enlarge('all') ends the step with it at 4 px.
const spec = { source: 'graph LR\nA -->|hello| B', style: 'nord' };
function smallLabel(): DiagramSnapshot {
  const shape = (x: number) => square(x, { fill: '#fff', stroke: '#000' });
  const snapshot = fixedSnapshot(
    spec,
    [
      { id: '__frame', role: 'frame', kind: 'shape', shapes: [shape(0)] },
      { id: 'A', role: 'node', kind: 'shape', shapes: [shape(0)] },
      { id: 'B', role: 'node', kind: 'shape', shapes: [shape(3)] },
      { id: 'edge:A->B#0', role: 'edge', kind: 'connector', shapes: [shape(1)], from: 'A', to: 'B', route: [[0.25, 0], [2.75, 0]] },
      { id: 'edge-label:A->B#0', owner: 'edge:A->B#0', role: 'edge-label', kind: 'text', shapes: [shape(1.5)] },
    ],
    { palette: { paper: '#123456', ink: '#fff', accent: '#ff0', muted: '#aaa' } },
  );
  snapshot.width = 1600;
  snapshot.height = 900;
  snapshot.parts.find((p) => p.id === 'B')!.shapes.push({
    subpaths: [],
    closed: [],
    style: { fill: '#ffffff', stroke: 'none', strokeWidth: 0, fillOpacity: 1, strokeOpacity: 1, opacity: 1 },
    text: 'B',
    fontSize: 0.04,
    textRun: { text: 'B', x: 300, y: 0, size: 4, matrix: [1, 0, 0, 1, 0, 0] },
  });
  return snapshot;
}

const gates: { gate: string; source: string; message: RegExp; snapshots?: () => Record<string, DiagramSnapshot> }[] = [
  {
    gate: 'catch lint: a catch around awaited construct code',
    source: scene(`try{await this.step('one');${label('hello')}}catch(e){}`),
    message: /Do not catch around awaited animation\/step calls/,
  },
  {
    // Module state survives between runs, so the seeked run draws a different count than the played one.
    gate: 'seek = play',
    source: scene(`await this.step('one');await s.enter(new Text('run '+(++runs),{fontSize:.4}),{describe:'runs'});`, 'let runs=0;'),
    message: /Seek mismatch at frame \d+/,
  },
  {
    gate: 'skipped trace = played trace',
    source: scene(`await this.step('one');${label('hello')}this.state.run=++runs;`, 'let runs=0;'),
    message: /Skipped and played traces differ/,
  },
  {
    gate: 'bare runtime',
    source: scene(`await this.step('one');${label('hello')}this.state.where=typeof process==='object'?'node':'bare';`),
    message: /The bare runtime \(no DOM, no Node\) disagrees with the trace/,
  },
  {
    gate: 'motion: a text removed without an animation',
    source: scene(`await this.step('one');const t=new Text('hello',{fontSize:.4});await s.enter(t,{describe:'hello'});await this.step('two');this.remove(t);${label('bye', '[0,-2]')}`),
    message: /Motion failures .*cut-out/,
  },
  {
    // The film holds, and the player stops on, the picture where the caption hold begins.
    gate: 'hold: the picture moves after the step’s last play()',
    source: scene(`await this.step('moves',{caption:'A caption long enough to need a hold of a few seconds at reading pace.'});const d=new Dot();await s.enter(d,{describe:'a dot'});d.addUpdater((m,dt)=>{m.shift([dt*0.5,0])});`),
    message: /The picture changes after the caption hold begins/,
  },
  {
    // A step line takes the band under the title; content must stay below it.
    gate: 'text: content runs into the heading’s line',
    source: scene(`await this.step('one',{title:'One',line:'A line under the title.'});${label('too high', '[0,3.45]', 0.3)}`),
    message: /runs into the heading's "A line under the title\."/,
  },
  {
    gate: 'step change: a step that ends on the same picture',
    source: `import{Scene,Text,FadeIn}from'rayner';import{stage}from'rayner/explain';export default class Same extends Scene{async construct(){const s=stage(this);await this.step('one',{title:'One'});await this.play(new FadeIn(new Text('hello',{color:s.look.ink})));await this.step('two',{title:'Two',caption:'Nothing new is drawn.'});await this.wait(.5);}}`,
    message: /Each step must change the picture[^]*two/,
  },
  {
    gate: 'text collision',
    source: scene(`await this.step('one');${label('first label')}${label('second label', '[0.2,0.05]')}`),
    message: /Resting frames have colliding or cut-off text/,
  },
  {
    // Every key is an identity, whatever it looks like: what the stage's chrome is for is its role.
    gate: 'keys: two parts on the stage with one key',
    source: scene(`await this.step('one');const a=new Text('a',{fontSize:.4});a.key='__shared';const b=new Text('b',{fontSize:.4}).shift([0,-1.5]);b.key='__shared';await s.enter(a,b,{describe:'two letters'});`),
    message: /Keys in the scene: at the end of a step, a key names one mobject/,
  },
  {
    gate: 'a connector through a resting label',
    source: scene(`await this.step('one');const wire=new Line([-2,0],[2,0]);await s.enter(wire,{describe:'wire'});${label('target')}`),
    message: /A connector crosses "target"/,
  },
  {
    gate: 'two overlapping imported labels',
    source: scene(`await this.step('one');await s.show(${JSON.stringify(spec)});`),
    snapshots: () => {
      const snapshot = smallLabel();
      for (const [id, text] of [['A', 'First imported'], ['B', 'Second imported']]) {
        const part = snapshot.parts.find((p) => p.id === id)!;
        part.shapes = [{ subpaths: [], closed: [], style: { fill: '#ffffff', stroke: 'none', strokeWidth: 0, fillOpacity: 1, strokeOpacity: 1, opacity: 1 }, text, fontSize: 0.4,
          textRun: { text: text!, x: 200, y: 200, size: 40, matrix: [1, 0, 0, 1, 0, 0] } }];
      }
      return { [diagramKey(spec)]: snapshot };
    },
    message: /"First imported" overlaps "Second imported"/,
  },
  {
    gate: 'imported legibility: a label readable only mid-sweep',
    source: `import{Scene}from'rayner';import{stage}from'rayner/explain';export default class Camera extends Scene{async construct(){const s=stage(this);await this.step('one',{caption:'Read the label.'});const d=await s.show(${JSON.stringify(spec)});await d.enlarge(['B']);await this.wait(.5);await d.enlarge('all');await this.wait(.5);}}`,
    snapshots: () => ({ [diagramKey(spec)]: smallLabel() }),
    message: /Imported labels need a readable completed-step view/,
  },
  {
    gate: 'native legibility',
    source: scene(`await this.step('one');${label('tiny', '[0,0]', 0.05)}`),
    message: /Labels never reach 14px at 1280px stage/,
  },
  // Legibility is measured on screen: world size times the camera's zoom, inside the camera's view.
  {
    gate: 'native legibility on screen: a 20 px label with the camera zoomed out 2x',
    source: scene(`this.frame.scale(2);await this.step('one',{caption:'Small.'});${label('far away', '[0,0]', 0.25)}`),
    message: /Labels never reach 14px[^]*far away/,
  },
  {
    // Zoomed 2x on the left half for the whole scene; the 10 px (world) label sits off camera on the right.
    gate: 'native legibility on screen: a label the camera never shows is not read',
    source: scene(`this.frame.scale(0.5).moveTo([-4,0]);await this.step('one',{caption:'Elsewhere.'});${label('in view', '[-4,0]', 0.4)}${label('off camera', '[5,0]', 0.125)}`),
    message: /Labels never reach 14px[^]*off camera/,
  },
  {
    // 8 px with the camera home; the camera passes 2x closer mid-step and comes back. A glide past is not a read.
    gate: 'native legibility: a label readable only while the camera glides past',
    source: scene(
      `await this.step('one',{caption:'A small label.'});${label('eight pixel words', '[0,-1.6]', 0.1)}await this.step('two',{caption:'The camera passes close and comes back.'});await this.play(this.frame.animate.scale(0.5).moveTo([0,-1.6]),{runTime:0.6});await this.play(this.frame.animate.reset(),{runTime:0.6});${label('later', '[3,0]')}`,
    ),
    message: /Labels never reach 14px[^]*eight pixel words/,
  },
  {
    // A camera stretched to 16 x 36 is letterboxed: 20 px per unit, so a label 16 px at home reads 4 px.
    gate: 'native legibility on screen: a camera out of 16:9 is letterboxed',
    source: scene(`this.frame.stretch(4,1);await this.step('one',{caption:'Tall.'});${label('tall view', '[0,0]', 0.2)}`),
    message: /Labels never reach 14px[^]*tall view/,
  },
  {
    gate: 'text in the camera’s view: a label the zoomed camera cuts in half',
    source: scene(`await this.step('one',{caption:'Cut.'});${label('a rather long label here', '[0,0]', 0.4)}await this.play(this.frame.animate.scale(0.25).moveTo([2,0]));`),
    message: /colliding or cut-off text[^]*cut off by the frame/,
  },
  {
    gate: 'hold: the camera drifts after the step’s last play()',
    source: scene(`await this.step('moves',{caption:'A caption long enough to need a hold of a few seconds at reading pace.'});${label('hello')}this.frame.addUpdater((m,dt)=>{m.shift([dt*0.5,0])});`),
    message: /The picture changes after the caption hold begins/,
  },
  {
    gate: 'picture descriptions: a drawing with no words',
    source: scene(`await this.step('one');await s.enter(new Rectangle({width:1,height:1}));`),
    message: /Every drawing needs words for readers who cannot see it/,
  },
  {
    gate: 'missing glyphs, named by scenario, step and code point',
    source: scene(
      `await this.step('one');${label('ok')}await this.step('two');await s.enter(new Text(settingsOf(this).k==='b'?'a中b':'ab',{fontSize:.4}).moveTo([0,-2]),{describe:'text'});`,
      '',
      `static settings=[{id:'k',label:'Kind',default:'a',options:[{value:'a',label:'Plain'},{value:'b',label:'Han'}]}];`,
    ),
    message: /Kind: Han, step two: "a中b" has 中 \(U\+4E2D\)/,
  },
  {
    // The fallback faces hold digits and a few numerals, not their scripts: an Arabic letter, which
    // would need shaping, and a Thai digit still fail, and only they are named.
    gate: 'missing glyphs: a fallback face covers numerals, not its whole script',
    source: scene(`await this.step('one');await s.enter(new Text('٣ب ३ ๓',{fontSize:.4}),{describe:'text'});`),
    message: /step one: "٣ب ३ ๓" has ب \(U\+0628\), ๓ \(U\+0E53\)$/m,
  },
  {
    gate: 'duplicate step names',
    source: `import{Scene}from'rayner';export default class Bad extends Scene{async construct(){await this.step('same');await this.wait(.5);await this.step('same');await this.wait(.5);}}`,
    message: /Duplicate step names/,
  },
  {
    // The caption keys a colour the stage never names: hidden, the caption takes the key with it.
    gate: 'a caption names a colour no word on the stage says',
    source: scene(`await this.step('one',{caption:'The red dot is the answer.'});await s.enter(new Dot({color:s.look.bad}),{describe:'A dot'});`),
    message: /Captions name a look the stage does not in the scene: one: the caption names “red”/,
  },
  {
    gate: 'a step kind that is not short, main or detail',
    source: scene(`await this.step('one',{caption:'A label.',kind:'details'});${label('hello')}`),
    message: /step one: kind must be 'short', 'main' or 'detail'/,
  },
  {
    gate: 'a scenario with no steps',
    source: `import{Scene,Dot,FadeIn}from'rayner';export default class Bad extends Scene{async construct(){await this.play(new FadeIn(new Dot()));}}`,
    message: /Each scenario needs non-empty named steps/,
  },
  {
    gate: 'one scene export',
    source: `import{Scene}from'rayner';export class A extends Scene{async construct(){await this.step('a');await this.wait(.5)}}export class B extends Scene{async construct(){await this.step('b');await this.wait(.5)}}`,
    message: /Export one Scene subclass/,
  },
];
for (const { gate, source, message, snapshots } of gates)
  test(`gate fails with its own message: ${gate}`, async () => {
    await assert.rejects(checked(await write(source, snapshots?.())), message);
  });

test('the key check names every key held twice, with no exception for the stage, whose chrome has a role instead', async () => {
  const { KeySink } = await import('../tools/lib/explain-check.ts');
  const { Scene, Text } = await import('../src/index.ts');
  const { stage } = await import('../explain/index.ts');
  const keys = new KeySink();
  class Twice extends Scene {
    override async construct() {
      const s = stage(this);
      // Numbered headings with lines crossfade at every step: their parts are 'chrome', never keyed.
      for (const step of ['one', 'two', 'three']) await this.step(step, { title: step, line: `the ${step} step` });
      const a = new Text('a'), b = new Text('b').shift([0, -1.5]);
      a.key = b.key = '__shared';
      await s.enter(a, b, { describe: 'two letters' });
    }
  }
  await new Twice(keys).run();
  assert.deepEqual(keys.problems, ['step "three": "__shared"']);
});

test('native legibility on screen: an 8 px label with the camera zoomed in 2x passes', async () => {
  await checked(await write(scene(`this.frame.scale(0.5);await this.step('one',{caption:'Close.'});${label('close up', '[0,0]', 0.1)}`)));
});

test('rayner check exits 1 and names the failing gate on stderr', async () => {
  const dir = await write(gates.find((g) => g.gate === 'seek = play')!.source);
  let refused: { status: number; stderr: Buffer } | undefined;
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools/explain.ts'), 'check', dir, '--out', join(dir, 'checks')], { stdio: 'pipe' });
  } catch (error) {
    refused = error as { status: number; stderr: Buffer };
  }
  assert.equal(refused?.status, 1, 'check must exit 1 on a scene whose seek differs from play');
  // The source CLI can follow Node's experimental type-stripping warning.
  assert.match(String(refused?.stderr), /^rayner: Seek mismatch at frame \d+ in the scene$/m);
});

// A scene with two settings (2 × 3 scenarios) and three steps; `nudgeIn` names the one scenario whose last
// step moves its dot by a nudge each frame instead of by blending, as the lantern explainer's tiny scene does.
const CASES_HEAD = `import{Scene,Text,Dot,Animation}from'rayner';import{stage,settingsOf}from'rayner/explain';`;
const scenariosScene = (nudgeIn?: { motion: string; size: string }) =>
  `${CASES_HEAD}class Nudge extends Animation{constructor(m){super(m,{runTime:1});this.live=false}begin(){super.begin();this.live=true}interpolate(){if(this.live)this.mobject.shift([0.1,0])}finish(){}}` +
  `export default class Scenarios extends Scene{static settings=[` +
  `{id:'motion',label:'Motion',default:'blend',options:[{value:'blend',label:'Blend'},{value:'nudge',label:'Nudge'}]},` +
  `{id:'size',label:'Size',default:'small',options:[{value:'small',label:'Small'},{value:'mid',label:'Mid'},{value:'large',label:'Large'}]}];` +
  `async construct(){const s=stage(this);const v=settingsOf(this);` +
  `await this.step('one',{caption:'A label.'});${label('one')}await this.wait(0.3);` +
  `await this.step('two',{caption:'Another.'});${label('two', '[0,2]')}await this.wait(0.3);` +
  `await this.step('three',{caption:'The dot moves.'});const d=new Dot({radius:0.2}).moveTo([-3,-2]);await s.enter(d,{describe:'A dot'});` +
  `const nudge=${nudgeIn ? `v.motion===${JSON.stringify(nudgeIn.motion)}&&v.size===${JSON.stringify(nudgeIn.size)}` : 'false'};` +
  `await this.play(nudge?new Nudge(d):d.animate.moveTo([0,-2]),{runTime:1});}}`;

test('rayner check seeks two frames in each step of every scenario: a nudge each frame in one scenario’s last step fails it with a seek mismatch naming that scenario', async () => {
  const clean = await checked(await write(scenariosScene()));
  const scenarios = clean.scenarios as { settings: Record<string, string>; steps: number; seekFrames: number }[];
  assert.equal(scenarios.length, 6);
  for (const v of scenarios) assert.equal(v.seekFrames, 2 * v.steps, JSON.stringify(v.settings));
  // The last scenario built, and the last step in it: a check that stopped short of either would pass.
  await assert.rejects(checked(await write(scenariosScene({ motion: 'nudge', size: 'large' }))), /Seek mismatch at frame \d+ in Motion: Nudge · Size: Large$/m);
  await assert.rejects(checked(await write(scenariosScene({ motion: 'blend', size: 'mid' }))), /Seek mismatch at frame \d+ in Motion: Blend · Size: Mid$/m);
});

test('the build makes every combination of options a scenario, rayner check tests each, and a reader can open no other', async () => {
  const dir = await write(scenariosScene());
  const project = await collectProject(dir, { write: false });
  const combos = ['blend', 'nudge'].flatMap((motion) => ['small', 'mid', 'large'].map((size) => ({ motion, size })));
  assert.deepEqual(project.scenarios.map((v) => v.values), combos);
  assert.deepEqual(scenariosOf(project.Scene), combos);
  const report = await checkProject(project, join(dir, 'checks'));
  assert.deepEqual((report.scenarios as { settings: Record<string, string> }[]).map((v) => v.settings), combos);
  // A value no option lists is refused, so no request reaches a scenario the build did not make.
  assert.throws(() => resolveSettings(project.Scene, { motion: 'spring' }), /Unknown .* option/);
  assert.throws(() => resolveSettings(project.Scene, { size: '0.1' }), /Unknown .* option/);
});
