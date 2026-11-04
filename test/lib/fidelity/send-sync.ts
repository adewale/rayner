import assert from 'node:assert/strict';
import {pictureHtml} from '../../../explain/trace.ts';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { SINGLES, WRAPS, build, nameOf, isSend, isSync, threads } from '../../../scenes/explainers/lib/send-sync.ts';
import type { Inner, Wrapper } from '../../../scenes/explainers/lib/send-sync.ts';

/** Every case's step state equals the evaluator's answers for its wrapper and inner type. */
export function check(trace: Trace, values: Record<string, string>): void {
  const wrapper = values.wrapper as Wrapper,
    inner = values.inner as Inner;
  assertStepState(trace, 'questions', {
    singles: Object.fromEntries(SINGLES.map((t) => [nameOf(t), { send: isSend(t), sync: isSync(t) }])),
  });
  for (const [step, name] of [
    ['i32', 'i32'],
    ['rc', 'Rc<i32>'],
    ['cell', 'Cell<i32>'],
    ['guard', 'MutexGuard<i32>'],
  ] as const)
    assertStepState(trace, step, { shown: name });
  const layers = build(wrapper, inner);
  // The opening is the same refused program in every case: x is an Arc<Cell<i32>>, and its
  // answer step shows the point that wrapping Cell<i32> in Arc moves to Neither.
  assertStepState(trace, 'spawn', { opening: threads('arc', 'cell') });
  assertStepState(trace, 'arc-cell', { opened: build('arc', 'cell')[1] });
  // The input type's two answers are said on its point where it is placed (once, among the
  // single types), and the built type's on its point in the last wrapper step.
  const said = (step: string, send: boolean, sync: boolean) => {
    const text = pictureHtml(trace.steps.find((s) => s.step === step)!.shown);
    assert.ok(text.includes(`Send: ${send ? 'yes' : 'no'}, Sync: ${sync ? 'yes' : 'no'}`), `${step}: ${text}`);
  };
  said(({ i32: 'i32', cell: 'cell', rc: 'rc' } as const)[inner], layers[0]!.send, layers[0]!.sync);
  said(`wrap-${WRAPS[wrapper].at(-1)!.toLowerCase()}`, layers.at(-1)!.send, layers.at(-1)!.sync);
  assertStepState(trace, 'rules', { layers });
  // One step per wrapper, inside out, each ending on the type built so far.
  WRAPS[wrapper].forEach((ctor, i) => assertStepState(trace, `wrap-${ctor.toLowerCase()}`, { built: layers[i + 1] }));
  assertStepState(trace, 'threads', { threads: threads(wrapper, inner) });
}
