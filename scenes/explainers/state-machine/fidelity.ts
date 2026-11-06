import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { pictureHtml } from '../../../explain/trace.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { textOf } from '../../../test/lib/fidelity.ts';
import { reduceSession, sessionAttempt } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  let state = 'idle';
  for (const event of values.events === 'success'
    ? ['CONNECT', 'OPENED', 'CLOSE']
    : ['CONNECT', 'ERROR']) {
    state = reduceSession(state, event);
    assertStepState(trace, event.toLowerCase(), { session: state, event });
  }
  assertStepState(trace, 'terminal', { invalid: sessionAttempt(state, 'OPENED') });
  // The table the code panel shows, read back from the picture, is the model's: for every
  // state and event it names, a row exactly where reduceSession has a transition.
  const shown = textOf(pictureHtml(trace.steps.find((s) => s.step === 'machine')!.shown));
  const rows = new Map([...shown.matchAll(/'(\w+):(\w+)':\s*'(\w+)'/g)].map((r) => [`${r[1]}:${r[2]}`, r[3]!]));
  assert.equal(rows.size, 4, shown);
  const states = new Set([...rows].flatMap(([k, v]) => [k.split(':')[0]!, v])),
    events = new Set([...rows.keys()].map((k) => k.split(':')[1]!));
  for (const st of states)
    for (const ev of events) assert.equal(rows.get(`${st}:${ev}`), sessionAttempt(st, ev).state, `${st}:${ev}`);
}
