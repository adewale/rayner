// stage.steps: each step's picture is drawn from the state it records, and rayner check
// redraws every step from the state its trace recorded, so a draw that reads anything else
// is caught. The deliberate defect here is a draw that reads a counter each step advances.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Text, TraceSink } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { stagedStepsOf } from '../explain/stage.ts';
import type { StagedStep, Stage } from '../explain/index.ts';
import { redrawStagedSteps } from '../tools/lib/explain-check.ts';

const words = (s: Stage, n: number) => new Group(s.scene.text(`count ${n}`, { fontSize: 0.5, color: s.palette.ink }));

async function run<S extends object = { n: number }>(steps: (bump: () => number) => StagedStep<S>[], kind: 'short' | 'main' = 'main') {
  let counter = 0;
  const bump = () => ++counter;
  class Steps extends Scene {
    override async construct() {
      await stage(this).steps(steps(bump), { kind });
    }
  }
  const sink = new TraceSink();
  const scene = new Steps(sink);
  await scene.run();
  return { scene, trace: { steps: sink.steps() } };
}

const staged = <S extends object>(id: string, state: S, draw: StagedStep<S>['draw']): StagedStep<S> =>
  ({ id, title: `Step ${id}`, line: 'A line.', caption: 'A caption long enough to read.', state, draw });
const step = (id: string, n: number, draw: StagedStep<{ n: number }>['draw']) => staged(id, { n }, draw);

test('stage.steps records each state, draws from it, and every step redraws the same from its trace', async () => {
  const { scene, trace } = await run(() => [1, 2, 3].map((n) => step(`s${n}`, n, (st, s) => words(s, st.n))));
  // The model is the step's state and nothing else: which picture is showing is not part of it.
  assert.deepEqual(trace.steps.map((s) => s.after), [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.ok(trace.steps.every((s) => (s.shown as { picture?: unknown }).picture), 'what the stage shows is traced apart, as shown');
  assert.deepEqual(stagedStepsOf(scene).map((r) => r.step), ['s1', 's2', 's3']);
  assert.deepEqual(redrawStagedSteps(scene, trace), { redrawn: 3, problems: [], ignoring: [] });
  // The shown picture is the step's drawing, described by its words.
  const shown = scene.mobjects.flatMap((m) => m.family()).filter((m): m is Text => m instanceof Text).map((t) => t.text);
  assert.ok(shown.includes('count 3'), JSON.stringify(shown));
});

test('a short path records each model as the state, marks its steps short, and redraws from it', async () => {
  const { scene, trace } = await run(() => [4, 5].map((n) => step(`r${n}`, n, (st, s) => words(s, st.n))), 'short');
  assert.deepEqual(trace.steps.map((s) => s.after), [{ n: 4 }, { n: 5 }]);
  assert.deepEqual(trace.steps.map((s) => s.meta.kind), ['short', 'short']);
  assert.deepEqual(redrawStagedSteps(scene, trace), { redrawn: 2, problems: [], ignoring: [] });
});

test('deliberate defect: a draw that reads a counter instead of its state fails the redraw, named by its step', async () => {
  // Each draw reads how many times any draw ran: right while the run is drawing, wrong when redrawn.
  const { scene, trace } = await run((bump) => [1, 2].map((n) => step(`s${n}`, n, (_, s) => words(s, bump()))));
  const { problems } = redrawStagedSteps(scene, trace);
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /^step "s1": its picture differs when drawn again from the state it recorded/);
  assert.match(problems[1]!, /^step "s2": /);
});

test('deliberate defect: a draw that ignores its state and draws a captured constant fails, named by its step', async () => {
  // Each picture is right for its step, so the redraw from the recorded state matches; but the draw
  // reads the value it captured, not its state, so the picture cannot follow the state it records.
  const { scene, trace } = await run(() => [1, 2].map((n) => step(`s${n}`, n, (_, s) => words(s, n))));
  const { problems, ignoring } = redrawStagedSteps(scene, trace);
  assert.deepEqual(ignoring, ['s1', 's2']);
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /^step "s1": its draw ignores its state; its picture is the same drawn from \d+ different states/);
  // The same pictures drawn from the state pass.
  const fixed = await run(() => [1, 2].map((n) => step(`s${n}`, n, (st, s) => words(s, st.n))));
  assert.deepEqual(redrawStagedSteps(fixed.scene, fixed.trace), { redrawn: 2, problems: [], ignoring: [] });
});

test('a lone step reading its state passes; one with an empty state is exempt; a style or a throw counts as reading it', async () => {
  // No other step to compare with: the state with its values changed is the different state.
  const lone = await run(() => [step('only', 7, (st, s) => words(s, st.n))]);
  assert.deepEqual(redrawStagedSteps(lone.scene, lone.trace).problems, []);
  // A static picture with nothing in its state has nothing to read.
  const still = await run(() => [staged('still', {}, (_, s) => words(s, 0))]);
  assert.deepEqual(redrawStagedSteps(still.scene, still.trace), { redrawn: 1, problems: [], ignoring: [] });
  // A flag that only colours the picture moves no box, yet the picture depends on it.
  const lit = await run(() => [staged('lit', { lit: true },
    (st, s) => new Group(s.scene.text('lamp', { fontSize: 0.5, color: st.lit ? s.emphasis : s.palette.ink })))]);
  assert.deepEqual(redrawStagedSteps(lit.scene, lit.trace).problems, []);
  // A draw that cannot draw a different state has read it.
  const picky = await run(() => [staged('picky', { level: 'AA' },
    (st, s) => { if (st.level !== 'AA') throw new Error('unknown level'); return words(s, 1); })]);
  assert.deepEqual(redrawStagedSteps(picky.scene, picky.trace).problems, []);
});

test('a step whose state is not JSON is refused before anything is drawn', async () => {
  await assert.rejects(
    run(() => [step('bad', Number.NaN, (st, s) => words(s, st.n))]),
    /step bad state/,
  );
});
