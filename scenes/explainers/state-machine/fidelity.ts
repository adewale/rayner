import assert from 'node:assert/strict';
import { pictureWordsAt, assertStepState } from '../../../explain/testing.ts';
import type { Trace } from '../../../explain/testing.ts';

/**
 * Each authored scenario's steps against an independent expectation of Node's WebSocket (model.test.ts
 * runs the real one): a send() on a new socket throws, the server's accept opens it, a send() in OPEN
 * reaches the server, and after close() a send() returns without sending.
 */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  if (values.when === 'connecting') {
    assertStepState(trace, 'answer', { ready: 'CONNECTING', event: 'send()', result: 'throws InvalidStateError', branch: 'throw', delivered: 0 });
    assertStepState(trace, 'open', { ready: 'OPEN', event: 'server accepts', result: 'fires open', branch: null, delivered: 0 });
    assertStepState(trace, 'send', { ready: 'OPEN', event: 'send()', result: 'sends the message', branch: 'queue', delivered: 1 });
  } else {
    assertStepState(trace, 'answer', { ready: 'CLOSING', event: 'send()', result: 'returns, sends nothing', branch: 'return', delivered: 1 });
    assertStepState(trace, 'closed', { ready: 'CLOSED', event: 'server answers close()', result: 'fires close', branch: null, delivered: 1 });
  }
  // The code panel shows Node's send(): its throw for CONNECTING and its return for every other state but OPEN.
  const shown = pictureWordsAt(trace, 'answer').full;
  assert.match(shown, /throw new DOMException\(/, shown);
  assert.match(shown, /"InvalidStateError"\);/, shown);
  assert.match(shown, /\|\| isClosing\(/, shown);
}
