// stage.steps: each step's picture is a view of the state it records, so rayner check holds it to
// its draw as it holds every view: redrawn from the step's state at its end (ViewSink), and drawn
// from other states to show it reads its own (viewIgnoresState). The deliberate defects here are
// a draw that reads a counter each step advances and one that draws a captured constant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Text } from '../src/index.ts';
import { TraceSink } from '../explain/testing.ts';
import { stage } from '../explain/index.ts';
import type { StagedStep, Stage } from '../explain/index.ts';
import { FanSink, ViewSink } from '../tools/lib/explain-check.ts';

const words = (s: Stage, n: number) => new Group(s.scene.text(`count ${n}`, { fontSize: 0.5, color: s.look.ink }));

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
  // The model is the step's state and nothing else: which picture is showing is not part of it.
  assert.deepEqual(trace.steps.map((s) => s.after), [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.ok(trace.steps.every((s) => s.shown?.picture), 'what the stage shows is traced apart, as shown');
  assert.deepEqual({ checked, problems }, { checked: 3, problems: [] });
  // The shown picture is the step's drawing, described by its words.
  const shown = scene.mobjects.flatMap((m) => m.family()).filter((m): m is Text => m instanceof Text).map((t) => t.text);
  assert.ok(shown.includes('count 3'), JSON.stringify(shown));
});

test('a short path records each model as the state, marks its steps short, and redraws from it', async () => {
  const { trace, checked, problems } = await run(() => [4, 5].map((n) => step(`r${n}`, n, (st, s) => words(s, st.n))), 'short');
  assert.deepEqual(trace.steps.map((s) => s.after), [{ n: 4 }, { n: 5 }]);
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
  assert.match(problems[0]!, /^step "s1": a view: its draw ignores its state; its picture is the same drawn from \d+ different states/);
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
    (st, s) => new Group(s.scene.text('lamp', { fontSize: 0.5, color: st.lit ? s.look.emphasis : s.look.ink })))]);
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
          draw: (st, s) => new Group(s.scene.text(st.name, { fontSize: 0.5, color: s.look.ink })),
          describe: (st) => `The word ${st.name}`,
        },
      ]);
      // @ts-expect-error a step's draw reads its own state, not another step's
      await s.steps([{ id: 'wrong', title: 'Wrong', line: 'A line.', caption: 'A caption.', state: { n: 1 }, draw: (st, s) => words(s, st.name) }]);
    }
  }
  void Mixed;
});
