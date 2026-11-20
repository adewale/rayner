// stage.steps: each step's picture is a view of the state it records, so rayner check holds it to
// its draw as it holds every view: redrawn from the step's state at its end (ViewSink), and drawn
// from other states to show it reads its own (viewIgnoresState). The deliberate defects here are
// a draw that reads a counter each step advances and one that draws a captured constant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Text } from '../src/index.ts';
import { TraceSink, assertStepState } from '../explain/testing.ts';
import { stage } from '../explain/index.ts';
import type { StagedStep, Stage } from '../explain/index.ts';
import { FanSink, ViewSink } from '../tools/lib/explain-check.ts';

const words = (s: Stage, n: number) => new Group(new Text(`count ${n}`, { fontSize: 0.5, color: s.look.ink, shaping: s.scene.textShaping }));

// Each test's steps have their own state type; `any` lets one runner take them all.
async function run(steps: (bump: () => number) => StagedStep<any>[], kind: 'short' | 'main' = 'main') {
  let counter = 0;
  const bump = () => ++counter;
  class Steps extends Scene {
    override async construct() {
      await stage(this).steps(steps(bump), { kind });
    }
  }
  const sink = new TraceSink(), views = new ViewSink();
  const scene = new Steps(new FanSink([sink, views]));
  await scene.run();
  const trace = { steps: sink.steps() };
  // What check reports for the run's views: each redraw, and each view's dependence on its state.
  return { scene, trace, checked: views.checked, problems: [...views.problems, ...views.ignoringProblems()], ignoring: views.ignoring };
}

const staged = <S extends object>(id: string, state: S, draw: StagedStep<S>['draw']): StagedStep<S> =>
  ({ id, title: `Step ${id}`, line: 'A line.', caption: 'A caption long enough to read.', state, draw });
const step = (id: string, n: number, draw: StagedStep<{ n: number }>['draw']) => staged(id, { n }, draw);

test('stage.steps records each state, draws it as a view of that state, and every view redraws the same at its step\'s end', async () => {
  const { scene, trace, checked, problems } = await run(() => [1, 2, 3].map((n) => step(`s${n}`, n, (st, s) => words(s, st.n))));
  assert.deepEqual(trace.steps.map((s) => s.state), [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.deepEqual(trace.steps.map((s) => s.after), [{}, {}, {}], 'local specimens leave the scene model intact');
  assert.ok(trace.steps.every((s) => s.derived?.picture), 'what the stage shows is traced apart, as shown');
  assert.deepEqual({ checked, problems }, { checked: 3, problems: [] });
  // The shown picture is the step's drawing, described by its words.
  const shown = scene.mobjects.flatMap((m) => m.family()).filter((m): m is Text => m instanceof Text).map((t) => t.text);
  assert.ok(shown.includes('count 3'), JSON.stringify(shown));
});

test('a short path records each model as the state, marks its steps short, and redraws from it', async () => {
  const { trace, checked, problems } = await run(() => [4, 5].map((n) => step(`r${n}`, n, (st, s) => words(s, st.n))), 'short');
  assert.deepEqual(trace.steps.map((s) => s.state), [{ n: 4 }, { n: 5 }]);
  assert.deepEqual(trace.steps.map((s) => s.meta.kind), ['short', 'short']);
  assert.deepEqual({ checked, problems }, { checked: 2, problems: [] });
});

test('deliberate defect: a draw that reads a counter instead of its state fails the redraw, named by its step', async () => {
  // Each draw reads how many times any draw ran: right while the run is drawing, wrong when redrawn.
  const { problems } = await run((bump) => [1, 2].map((n) => step(`s${n}`, n, (_, s) => words(s, bump()))));
  assert.match(problems[0]!, /^step "s1": a view: /);
  assert.ok(problems.some((p) => p.startsWith('step "s2": a view: ')), problems.join('\n'));
});

test('deliberate defect: a draw that ignores its state and draws a captured constant fails, named by its step', async () => {
  // Each picture is right for its step, so the redraw from the recorded state matches; but the draw
  // reads the value it captured, not its state, so the picture cannot follow the state it records.
  const { problems, ignoring } = await run(() => [1, 2].map((n) => step(`s${n}`, n, (_, s) => words(s, n))));
  assert.deepEqual(ignoring, ['step "s1": a view', 'step "s2": a view']);
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /^step "s1": a view: sampled alternative inputs produced the same picture \(\d+ model states\); state dependence is unproven/);
  // The same pictures drawn from the state pass.
  const fixed = await run(() => [1, 2].map((n) => step(`s${n}`, n, (st, s) => words(s, st.n))));
  assert.deepEqual({ problems: fixed.problems, ignoring: fixed.ignoring }, { problems: [], ignoring: [] });
});

test('a lone step reading its state passes; one with an empty state is exempt; a style or a throw counts as reading it', async () => {
  // No other step to compare with: the state with its values changed is the different state.
  const lone = await run(() => [step('only', 7, (st, s) => words(s, st.n))]);
  assert.deepEqual(lone.problems, []);
  // A static picture with nothing in its state has nothing to read.
  const still = await run(() => [staged('still', {}, (_, s) => words(s, 0))]);
  assert.deepEqual({ checked: still.checked, problems: still.problems, ignoring: still.ignoring }, { checked: 1, problems: [], ignoring: [] });
  // A flag that only colours the picture moves no box, yet the picture depends on it.
  const lit = await run(() => [staged('lit', { lit: true },
    (st, s) => new Group(new Text('lamp', { fontSize: 0.5, color: st.lit ? s.look.emphasis : s.look.ink, shaping: s.scene.textShaping })))]);
  assert.deepEqual(lit.problems, []);
  // A draw that cannot draw a different state has read it.
  const picky = await run(() => [staged('picky', { level: 'AA' },
    (st, s) => { if (st.level !== 'AA') throw new Error('unknown level'); return words(s, 1); })]);
  assert.deepEqual(picky.problems, []);
});

test('a step whose state is not JSON is refused before anything is drawn', async () => {
  await assert.rejects(
    run(() => [step('bad', Number.NaN, (st, s) => words(s, st.n))]),
    /s\.steps\(\): state[.\w\[\]]* must .* \(step "bad"\)/,
  );
});

test('stage.steps types each step by its own state, so one list holds steps whose states differ', async () => {
  class Mixed extends Scene<{}, {}> {
    override async construct() {
      const s = stage(this);
      await s.steps([
        { id: 'count', title: 'A count', line: 'A line.', caption: 'A caption long enough to read.', state: { n: 3 }, draw: (st, s) => words(s, st.n) },
        {
          id: 'name', title: 'A name', line: 'A line.', caption: 'A caption long enough to read.', state: { name: 'three' },
          draw: (st, s) => new Group(new Text(st.name, { fontSize: 0.5, color: s.look.ink, shaping: s.scene.textShaping })),
          describe: (st) => `The word ${st.name}`,
        },
      ]);
      // @ts-expect-error a step's draw reads its own state, not another step's
      await s.steps([{ id: 'wrong', title: 'Wrong', line: 'A line.', caption: 'A caption.', state: { n: 1 }, draw: (st, s) => words(s, st.name) }]);
    }
  }
  void Mixed;
});

test('heterogeneous staged inputs preserve the typed model during frames, callbacks and the following ordinary step', async () => {
  const observed: number[] = [], trace = new TraceSink(), checks = new ViewSink();
  class Persistent extends Scene<{ count: number }> {
    override state = { count: 7 };
    override async construct() {
      const model = this.state;
      this.onStepEnd(() => { observed.push(this.state.count); assert.equal(this.state, model); });
      const s = stage(this);
      await s.steps([
        { id: 'local-count', title: 'Count', line: 'Count.', caption: 'The local count.', state: { n: 3 }, draw: (st, api) => words(api, st.n) },
        { id: 'local-name', title: 'Name', line: 'Name.', caption: 'The local name.', state: { label: 'seven' }, draw: (st) => new Text(st.label) },
      ]);
      assert.equal(this.state.count, 7);
      await this.step('model');
      await s.clear({ runTime: 0 });
      this.state.count++;
      await this.wait(0.1);
    }
  }
  const frameCounts: number[] = [];
  const scene = new Persistent(new FanSink([trace, checks, { async frame(sc) { frameCounts.push((sc as Persistent).state.count); } }]));
  await scene.run();
  assert.deepEqual(observed, [7, 7, 8]);
  assert.ok(frameCounts.length > 5);
  assert.ok(frameCounts.every((count) => count === 7 || count === 8), 'every frame can read the typed model');
  assert.deepEqual(trace.steps().map((s) => s.before), [{ count: 7 }, { count: 7 }, { count: 7 }]);
  assert.deepEqual(trace.steps().map((s) => s.after), [{ count: 7 }, { count: 7 }, { count: 8 }]);
  assert.deepEqual(trace.steps().map((s) => s.state), [{ n: 3 }, { label: 'seven' }, undefined]);
  assertStepState({ steps: trace.steps() }, 'local-name', { label: 'seven' });
  assertStepState({ steps: trace.steps() }, 'model', { count: 8 });
  assert.equal(checks.checked, 2);
  assert.deepEqual([...checks.problems, ...checks.ignoringProblems()], []);
});

test('a staged step’s prediction reaches its step’s metadata, where the player and check read it', async () => {
  const predict = { options: ['1', '2'], answer: '2' };
  const { trace } = await run(() => [{ ...step('ask', 1, (st, s) => words(s, st.n)), predict }, step('answer', 2, (st, s) => words(s, st.n))]);
  assert.deepEqual(trace.steps.map((s) => s.meta.predict), [predict, undefined]);
});


test('threshold pictures need a valid contrasting example; equal probes do not prove constant drawing', async () => {
  const draw = (st: { n: number }, s: Stage) => new Group(new Text(st.n >= 3 ? 'open' : 'waiting', { color: s.look.ink }));
  const threshold = await run(() => [step('waiting', 0, draw)]);
  assert.equal(threshold.problems.length, 1);
  assert.match(threshold.problems[0]!, /state dependence is unproven/);
  assert.ok(!threshold.problems[0]!.includes('ignores its state'));
  const contrasted = await run(() => [step('open', 3, draw), step('waiting', 0, draw)]);
  assert.deepEqual(contrasted.problems, []);
});
