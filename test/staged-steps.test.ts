// stage.steps: each step's picture is drawn from the state it records, and rayner check
// redraws every step from the state its trace recorded, so a draw that reads anything else
// is caught. The deliberate defect here is a draw that reads a counter each step advances.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Text, TraceSink } from '../src/index.ts';
import { stage, stagedStepsOf } from '../explain/index.ts';
import type { StagedStep, Stage } from '../explain/index.ts';
import { redrawStagedSteps } from '../tools/lib/explain-check.ts';

const words = (s: Stage, n: number) => new Group(s.scene.text(`count ${n}`, { fontSize: 0.5, color: s.palette.ink }));

async function run(steps: (bump: () => number) => StagedStep<{ n: number }>[], reader = false) {
  let counter = 0;
  const bump = () => ++counter;
  class Steps extends Scene {
    override async construct() {
      await stage(this).steps(steps(bump), { reader });
    }
  }
  const sink = new TraceSink();
  const scene = new Steps(sink);
  await scene.run();
  return { scene, trace: { steps: sink.steps() } };
}

const step = (id: string, n: number, draw: StagedStep<{ n: number }>['draw']): StagedStep<{ n: number }> =>
  ({ id, title: `Step ${id}`, line: 'A line.', caption: 'A caption long enough to read.', state: { n }, draw });

test('stage.steps records each state, draws from it, and every step redraws the same from its trace', async () => {
  const { scene, trace } = await run(() => [1, 2, 3].map((n) => step(`s${n}`, n, (st, s) => words(s, st.n))));
  assert.deepEqual(trace.steps.map((s) => ({ n: s.after!.n, phase: s.after!.phase })), [{ n: 1, phase: 's1' }, { n: 2, phase: 's2' }, { n: 3, phase: 's3' }]);
  assert.deepEqual(stagedStepsOf(scene).map((r) => r.step), ['s1', 's2', 's3']);
  assert.deepEqual(redrawStagedSteps(scene, trace), { redrawn: 3, problems: [] });
  // The shown picture is the step's drawing, described by its words.
  const shown = scene.mobjects.flatMap((m) => m.family()).filter((m): m is Text => m instanceof Text).map((t) => t.text);
  assert.ok(shown.includes('count 3'), JSON.stringify(shown));
});

test('a reader path records each state under state.reader and redraws from it', async () => {
  const { scene, trace } = await run(() => [4, 5].map((n) => step(`r${n}`, n, (st, s) => words(s, st.n))), true);
  assert.deepEqual(trace.steps.map((s) => (s.after as { reader: unknown }).reader), [{ n: 4 }, { n: 5 }]);
  assert.deepEqual(trace.steps.map((s) => s.meta.reader), [true, true]);
  assert.deepEqual(redrawStagedSteps(scene, trace), { redrawn: 2, problems: [] });
});

test('deliberate defect: a draw that reads a counter instead of its state fails the redraw, named by its step', async () => {
  // Each draw reads how many times any draw ran: right while the run is drawing, wrong when redrawn.
  const { scene, trace } = await run((bump) => [1, 2].map((n) => step(`s${n}`, n, (_, s) => words(s, bump()))));
  const { problems } = redrawStagedSteps(scene, trace);
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /^step "s1": its picture differs when drawn again from the state it recorded/);
  assert.match(problems[1]!, /^step "s2": /);
});

test('a step whose state is not JSON is refused before anything is drawn', async () => {
  await assert.rejects(
    run(() => [step('bad', Number.NaN, (st, s) => words(s, st.n))]),
    /step bad state/,
  );
});
