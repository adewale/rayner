// The served review of live states (tools/lib/explain-live-review.ts): which states it visits,
// and that a picture reached only by pressing an event is held to the review's rules. A lamp whose
// word is drawn tiny only when an event makes it bright fails the review (the deliberate defect);
// the same lamp drawn at its normal size passes. `rayner check` is not run here, so the failure is
// the served review's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Machine, Scene } from '../../src/index.ts';
import { NullSink } from '../../src/output.ts';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';
import { liveSubjects, liveVisits, reviewLiveStates } from '../../tools/lib/explain-live-review.ts';
import { LIVE_STATES } from '../../tools/lib/explain-review-plan.ts';
import { reviewScene } from '../../tools/lib/explain-review-scene.ts';

/**
 * A lamp a reader switches at its step `press`; with `defect`, a setting draws its word tiny when
 * bright, and another adds a note when bright, readable at a 1280 px stage but small and far from
 * the lamp, so on a phone neither the whole picture nor the step's close-up reads it.
 */
const lamp = (defect: boolean) => `import{Scene,Text,Group,Rectangle,Machine,refuse,view}from'rayner';import{stage,settingsOf}from'rayner/explain';
const LEVELS=['off','dim','bright'];
export default class Lamp extends Scene{
  static meta={id:'lamp',title:'A lamp a reader can switch'};
  ${defect ? "static settings=[{id:'label',label:'Label',default:'kept',options:[{value:'kept',label:'Kept'},{value:'tiny',label:'Tiny when bright'},{value:'far',label:'A far note when bright'}]}];" : ''}
  state={level:0};
  async construct(){
    const s=stage(this),tiny=${defect ? "settingsOf(this).label==='tiny'" : 'false'},far=${defect ? "settingsOf(this).label==='far'" : 'false'};
    const picture=view(this,(st)=>{
      const word=new Text('lamp '+LEVELS[st.level],{fontSize:tiny&&st.level===2?0.1:0.6});word.key='lamp:word';
      const parts=[new Rectangle({width:4,height:1.2}),word];
      if(far&&st.level===2)parts.push(Object.assign(new Text('bright, its brightest',{fontSize:0.18}).moveTo([-5.6,-3.6]),{key:'lamp:note'}));
      return Object.assign(new Group(...parts),{key:'lamp'});
    });
    s.keep(picture,{describe:()=>picture.texts.join(' ')});
    this.add(picture);
    const machine=new Machine(this,{start:{level:0},events:['UP','DOWN'],labels:{UP:'Brighter'},
      next:(st,e)=>e==='UP'?(st.level<2?{level:st.level+1}:refuse('It is as bright as it goes')):(st.level>0?{level:st.level-1}:refuse('It is off')),
      views:[picture],runTime:0.3});
    await this.step('intro',{caption:'A lamp, off.'});
    await this.wait(0.2);
    await this.step('press',{caption:'Press the switch: the lamp is dim.'});
    await this.play(machine.replay(['UP']));
  }
}`;

const options = { skip: process.env.EXPLAIN_BROWSER ? false : 'set EXPLAIN_BROWSER=1 for served live-state review checks' };

test('the visited live states: every state one press away, then breadth first, then the farthest, at most LIVE_STATES', () => {
  const scene = new Scene(new NullSink());
  // A counter from 0 to 9: one press away are 1 (UP) and nothing below 0; the farthest is 9.
  const counter = new Machine<{ n: number }, 'UP' | 'DOWN' | 'STAY'>(scene, {
    start: { n: 0 }, events: ['UP', 'DOWN', 'STAY'], views: [],
    next: (s, e) => (e === 'UP' ? (s.n < 9 ? { n: s.n + 1 } : undefined) : e === 'DOWN' ? (s.n > 0 ? { n: s.n - 1 } : undefined) : s),
  });
  const visits = liveVisits(counter as never, { n: 0 });
  assert.deepEqual(visits, [['UP'], ['UP', 'UP'], ['UP', 'UP', 'UP'], ['UP', 'UP', 'UP', 'UP'], ['UP', 'UP', 'UP', 'UP', 'UP'], Array(9).fill('UP')]);
  assert.equal(visits.length, LIVE_STATES);
  // From the middle, both neighbours are one press away; the start itself is never revisited.
  assert.deepEqual(liveVisits(counter as never, { n: 5 }).slice(0, 2), [['UP'], ['DOWN']]);
  // Every state one press away is visited, however many: ten events, ten neighbours.
  const fan = new Machine<{ at: string }, string>(scene, {
    start: { at: '' }, events: Array.from({ length: 10 }, (_, i) => `go ${i}`), views: [],
    next: (s, e) => (s.at ? undefined : { at: e }),
  });
  assert.equal(liveVisits(fan as never, { at: '' }).length, 10);
  // A machine whose every event returns to where it is has its first such event pressed once.
  const still = new Machine<{ k: number }, 'NO' | 'SAME'>(scene, { start: { k: 0 }, events: ['NO', 'SAME'], views: [], next: (s, e) => (e === 'SAME' ? s : undefined) });
  assert.deepEqual(liveVisits(still as never, { k: 0 }), [['SAME']]);
});

test('a label tiny only in a state an event reaches fails the served review; the same lamp at its size passes', options, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-live-review-'));
  const browser = await launch();
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  try {
    await writeFile(join(dir, 'scene.ts'), lamp(true));
    const project = await collectProject(dir, { write: false });
    await buildExplainer(project, join(dir, 'lamp.html'));
    server = await serve(dir, 0, 'lamp.html');
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const [kept, tiny, far] = project.scenarios;
    // From dim, one press away are bright (Brighter) and off (DOWN): both are visited.
    const keptSubjects = await liveSubjects(kept!);
    assert.deepEqual(keptSubjects.map((s) => [s.step, s.sent]), [['press', ['UP']], ['press', ['DOWN']]]);
    assert.deepEqual(keptSubjects[0]!.buttons.map((b) => [b.event, b.kind, b.reason]), [['UP', 'refused', 'It is as bright as it goes'], ['DOWN', 'next', '']]);
    const reviewed = await reviewLiveStates(page, `${server.url}/lamp.html`, kept!, keptSubjects);
    assert.deepEqual(reviewed.map((r) => [r.width, r.sent.join(',')]), [[390, 'UP'], [390, 'DOWN'], [1180, 'UP'], [1180, 'DOWN']]);
    for (const r of reviewed) {
      assert.ok(r.targets.some((t) => /lamp/.test(t)), `${r.sent}: what changed is the lamp's word (${r.targets})`);
      assert.ok(r.minimumLabelPx1280! >= 47 && r.minimumLabelPx1280! <= 49, `the word reads at 48 px at a 1280 px stage, not ${r.minimumLabelPx1280}`);
      if (r.width === 390) assert.ok(r.changedLabelPx! >= 12, `on a phone the changed word reads at ${r.changedLabelPx} px`);
    }
    assert.deepEqual(errors, []);
    // The defect: bright draws the word at a fifth of its size. Only a press reaches bright.
    await assert.rejects(
      reviewLiveStates(page, `${server.url}/lamp.html`, tiny!, await liveSubjects(tiny!)),
      /press after \[UP\] at 390px: labels under 14 px[\s\S]*“lamp bright” is 8\.0 px at a 1280 px stage/,
    );
    assert.deepEqual(errors, []);
    // The phone defect: the note bright adds reads at 14.4 px at a 1280 px stage, but a phone reader who
    // presses Brighter cannot read it in the whole picture or the step's close-up.
    await assert.rejects(
      reviewLiveStates(page, `${server.url}/lamp.html`, far!, await liveSubjects(far!)),
      /press after \[UP\] at 390px: what the events changed reads under 12 px on a phone[\s\S]*“bright, its brightest” is \d\.\d px at its best view/,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('rayner review visits the live states and records them in its receipt', options, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-live-review-scene-'));
  try {
    await writeFile(join(dir, 'scene.ts'), lamp(false));
    const result = await reviewScene(await collectProject(dir, { write: false }), join(dir, 'review'));
    assert.equal(result.liveStateWidths, 4);
    assert.deepEqual(result.results[0]!.live!.map((s) => [s.step, s.sent, s.width]), [['press', ['UP'], 390], ['press', ['DOWN'], 390], ['press', ['UP'], 1180], ['press', ['DOWN'], 1180]]);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'review/review.json'), 'utf8')).results[0].live, result.results[0]!.live);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('`rayner init --machine` writes a scene that `rayner review` passes as written, live states included', options, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-init-machine-review-'));
  try {
    execFileSync(process.execPath, ['tools/explain.ts', 'init', '--machine', join(dir, 'door')], { stdio: 'pipe' });
    const result = await reviewScene(await collectProject(join(dir, 'door'), { write: false }), join(dir, 'review'));
    // From the locked door one press (unlock) reaches closed, and a second (open) the open door: two states, both widths.
    assert.deepEqual(result.results[0]!.live!.map((s) => [s.sent.join(','), s.width]), [['unlock', 390], ['unlock,open', 390], ['unlock', 1180], ['unlock,open', 1180]]);
    for (const s of result.results[0]!.live!.filter((s) => s.width === 390)) assert.ok(s.changedLabelPx! >= 12, `${s.sent}: what the press changed reads at ${s.changedLabelPx} px on a phone`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
