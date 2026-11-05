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
import { Machine, NullSink, Scene } from '../../src/index.ts';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { launch } from '../../tools/lib/browser.ts';
import { liveSubjects, liveVisits, reviewLiveStates } from '../../tools/lib/explain-live-review.ts';
import { LIVE_STATES } from '../../tools/lib/explain-review-plan.ts';
import { reviewScene } from '../../tools/lib/explain-review-scene.ts';

/** A lamp a reader switches at its step `press`; with `defect`, a setting draws its word tiny when bright. */
const lamp = (defect: boolean) => `import{Scene,Text,Group,Rectangle,Machine,refuse,view}from'rayner';import{stage,settingsOf}from'rayner/explain';
const LEVELS=['off','dim','bright'];
export default class Lamp extends Scene{
  static meta={id:'lamp',title:'A lamp a reader can switch'};
  ${defect ? "static settings=[{id:'label',label:'Label',default:'kept',options:[{value:'kept',label:'Kept'},{value:'tiny',label:'Tiny when bright'}]}];" : ''}
  state={level:0};
  async construct(){
    const s=stage(this),tiny=${defect ? "settingsOf(this).label==='tiny'" : 'false'};
    const picture=view(this,(st)=>{
      const word=new Text('lamp '+LEVELS[st.level],{fontSize:tiny&&st.level===2?0.1:0.5});word.key='lamp:word';
      return Object.assign(new Group(new Rectangle({width:4,height:1.2}),word),{key:'lamp'});
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
    const [kept, tiny] = project.scenarios;
    // From dim, one press away are bright (Brighter) and off (DOWN): both are visited.
    const keptSubjects = await liveSubjects(kept!);
    assert.deepEqual(keptSubjects.map((s) => [s.step, s.sent]), [['press', ['UP']], ['press', ['DOWN']]]);
    assert.deepEqual(keptSubjects[0]!.buttons.map((b) => [b.event, b.kind, b.reason]), [['UP', 'refused', 'It is as bright as it goes'], ['DOWN', 'next', '']]);
    const reviewed = await reviewLiveStates(page, `${server.url}/lamp.html`, kept!, keptSubjects);
    assert.deepEqual(reviewed.map((r) => [r.width, r.sent.join(',')]), [[390, 'UP'], [390, 'DOWN'], [1180, 'UP'], [1180, 'DOWN']]);
    for (const r of reviewed) {
      assert.ok(r.targets.some((t) => /lamp/.test(t)), `${r.sent}: what changed is the lamp's word (${r.targets})`);
      assert.ok(r.minimumLabelPx1280! >= 39 && r.minimumLabelPx1280! <= 41, `the word reads at 40 px at a 1280 px stage, not ${r.minimumLabelPx1280}`);
    }
    assert.deepEqual(errors, []);
    // The defect: bright draws the word at a fifth of its size. Only a press reaches bright.
    await assert.rejects(
      reviewLiveStates(page, `${server.url}/lamp.html`, tiny!, await liveSubjects(tiny!)),
      /press after \[UP\] at 390px: labels under 14 px[\s\S]*“lamp bright” is 8\.0 px at a 1280 px stage/,
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
