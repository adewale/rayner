import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceSession } from './model.ts';

test('both session histories come from the reducer; closed rejects all modeled events', () => {
  for (const events of [
    ['CONNECT', 'OPENED', 'CLOSE'],
    ['CONNECT', 'ERROR'],
  ])
    assert.equal(events.reduce(reduceSession, 'idle'), 'closed');
  const transitions: Record<string, Record<string, string>> = {
    idle: { CONNECT: 'connecting' }, connecting: { OPENED: 'open', ERROR: 'closed' }, open: { CLOSE: 'closed' }, closed: {},
  };
  for (const [state, allowed] of Object.entries(transitions)) for (const event of ['CONNECT', 'OPENED', 'CLOSE', 'ERROR']) {
    if (Object.hasOwn(allowed, event)) assert.equal(reduceSession(state, event), allowed[event]);
    else assert.throws(() => reduceSession(state, event), /InvalidTransition/);
  }
});
