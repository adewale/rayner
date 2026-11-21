import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Transform } from '../src/index.ts';
import { Machine, stage, view } from '../explain/index.ts';
import { card } from '../explain/drawing.ts';
import { traceRun } from '../src/trace.ts';
import { observedValue } from '../explain/internal.ts';
import { describeScenario } from '../explain/describe.ts';
import { exploreMachines, ViewSink } from '../tools/lib/explain-check.ts';
import { raceStart, raceNext, RACE_EVENTS } from '../scenes/explainers/latest-search/model.ts';
import type { RaceState, RaceEvent } from '../scenes/explainers/latest-search/model.ts';

// Independent, finite path inventory of the guarded two-search race. Every permitted edge ends
// at one of these nonempty paths; observing the published page must not erase any of them.
const PATHS: RaceEvent[][] = [[], ['start A'], ['start A','start B'], ['start A','A lands'],
  ['start A','start B','A lands'], ['start A','start B','B lands'], ['start A','A lands','start B'],
  ['start A','start B','A lands','B lands'], ['start A','start B','B lands','A lands'], ['start A','A lands','start B','B lands']];
function pageScene(observe?: (state: Readonly<RaceState>) => unknown, constant = false, corrupt = false) {
  const edges: string[] = [];
  class Page extends Scene {
    override state: RaceState = raceStart(true);
    override async construct() {
      const s = stage(this, { heading: false }), drawing = s.drawing;
      await this.step('page', { caption: 'The published page.' });
      const page = view(this, state => card(drawing, [['Result', constant ? 'Blank' : state.page ?? 'Blank']], { title: 'Published page', width: 8, size: .65 }));
      const transition = Object.fromEntries(RACE_EVENTS.map(event => [event, (t: import('../explain/index.ts').Transition<RaceState, RaceEvent>) => {
        edges.push([...t.before.log, t.event].join('|'));
        return new Transform(page.current, t.target(page).copy().shift(corrupt ? [1, 0] : [0, 0]), { runTime: .08 });
      }]));
      const machine = new Machine(this, { start: raceStart(true), events: RACE_EVENTS, next: raceNext, views: [page], transition, ...(observe ? { observe } : {}) });
      await s.enter(page);
      machine.offer();
    }
  }
  return { Page, edges };
}

test('published-page observations keep all ten hidden states, nine continuations and three observed values', async () => {
  const { Page, edges } = pageScene(state => state.page);
  const { scene } = await traceRun(Page), [report] = await exploreMachines(scene, Page);
  assert.equal(report!.states, 10);
  assert.equal(report!.observations, 3);
  assert.equal(report!.sampled, false);
  assert.deepEqual(report!.problems, []);
  assert.deepEqual(edges.sort(), PATHS.slice(1).map(path => path.join('|')).sort());
  const [machine] = (await import('../explain/internal.ts')).machinesOf(scene);
  const empty = raceStart(true), running = raceNext(empty, 'start A');
  assert.ok(!('reason' in running));
  assert.equal(observedValue(machine!, empty), null);
  assert.equal(observedValue(machine!, running as RaceState), null);
  assert.ok('refused' in machine!.outcome(empty, 'A lands'));
  assert.ok('next' in machine!.outcome(running as RaceState, 'A lands'));
  const described = (await describeScenario(Page, {}, { drawings: false })).machines![0]!;
  assert.equal(described.states, 10);
  assert.equal(described.observations, 3);
  assert.equal(described.live!.observations, 3);
});

test('a singleton observation is valid while different selected values still require distinguishable descriptions', async () => {
  const single = pageScene(() => null, true);
  const { scene } = await traceRun(single.Page), [report] = await exploreMachines(scene, single.Page);
  assert.equal(report!.states, 10);
  assert.equal(report!.observations, 1);
  assert.deepEqual(report!.problems, []);
  const sink = new ViewSink();
  await new single.Page(sink).run();
  assert.deepEqual(sink.problems, []);
  assert.deepEqual(sink.ignoringProblems(), []);
  const broken = pageScene(state => state.page, true);
  const { scene: wrong } = await traceRun(broken.Page), [failure] = await exploreMachines(wrong, broken.Page);
  assert.ok(failure!.problems.some(problem => /different observation/.test(problem)));
  const strict = pageScene();
  const { scene: identity } = await traceRun(strict.Page), [defaultFailure] = await exploreMachines(identity, strict.Page);
  assert.equal(defaultFailure!.observations, 10, 'omitting observe retains full-model discrimination');
  assert.ok(defaultFailure!.problems.some(problem => /different observation/.test(problem)));
});

test('observation selectors do not excuse incorrect transition endpoints or collapse sampled model counts', async () => {
  const broken = pageScene(() => null, false, true);
  const { scene } = await traceRun(broken.Page), [report] = await exploreMachines(scene, broken.Page);
  assert.ok(report!.problems.some(problem => /transition ends somewhere other/.test(problem)));
  const host = new class extends Scene { override state = { n: 0 }; }({ async frame() {} });
  const machine = new Machine(host, { start: { n: 0 }, events: ['up'], next: st => ({ n: st.n + 1 }), views: [], limit: 4, observe: () => 0 });
  assert.equal(machine.explore().states.length, 4);
  assert.equal(machine.explore().complete, false);
});

test('observation JSON is validated and detached; mutations and inconsistent repeated results reject', () => {
  const host = new class extends Scene { override state = { n: 0 }; }({ async frame() {} });
  const make = (observe: (state: Readonly<{ n: number }>) => unknown) => new Machine(host, { start: { n: 0 }, events: ['up'], next: st => ({ n: st.n + 1 }), views: [], observe });
  for (const value of [undefined, NaN, Infinity, new Date(), () => 1, [undefined]])
    assert.throws(() => observedValue(make(() => value), { n: 0 }), /machine\.observe\(\)/);
  const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
  assert.throws(() => observedValue(make(() => cyclic), { n: 0 }), /finite, acyclic JSON/);
  const original = { n: 0 };
  assert.throws(() => observedValue(make(st => { (st as { n: number }).n = 9; return 0; }), original), /must not change the model/);
  assert.deepEqual(original, { n: 0 });
  let counter = 0;
  assert.throws(() => observedValue(make(() => counter++), original), /repeated observations.*agree/);
  const payload = { values: [1, 2] }, copied = observedValue(make(() => payload), original) as { values: number[] };
  copied.values[0] = 99;
  assert.deepEqual(payload, { values: [1, 2] });
  const prototypeKey = Object.fromEntries([['__proto__', 'a literal observation']]);
  assert.deepEqual(observedValue(make(() => prototypeKey), original), prototypeKey);
});

test('an observed machine cannot waive an ordinary earlier use of the same blind view', async () => {
  for (const registeredEarly of [false, true]) {
    class Mixed extends Scene {
      override state = { n: 0 };
      override async construct() {
        const s = stage(this, { heading: false }), drawing = s.drawing;
        const blind = view(this, () => card(drawing, [['Result', 'Blank']], { size: .65 }));
        const make = () => new Machine(this, { start: {n:0}, events:['up'], next: st => ({n:Math.min(2,st.n+1)}), views:[blind], observe: () => 0 });
        let machine = registeredEarly ? make() : undefined;
        await this.step('ordinary', { caption: 'An ordinary view must read its input.' });
        await s.enter(blind);
        await this.step('observed', { caption: 'The machine declares a singleton observation here.' });
        machine ??= make(); machine.offer();
      }
    }
    const sink = new ViewSink(); await new Mixed(sink).run();
    assert.equal(sink.ignoringProblems().length, 1);
    assert.match(sink.ignoringProblems()[0]!, /step "ordinary"/);
  }
});

test('a failing observation reports its machine, offered step, model and shortest event path', async () => {
  const {Page} = pageScene(state => { if(state.log.length === 2) throw new Error('unexpected observation'); return state.page; });
  const {scene} = await traceRun(Page);
  await assert.rejects(exploreMachines(scene,Page), /Machine 1 at step "page".*after start A, start B.*model .*unexpected observation/);
  await assert.rejects(describeScenario(Page,{}, {drawings:false}), /machine 1 at step "page".*after start A, start B.*model .*unexpected observation/);
});
