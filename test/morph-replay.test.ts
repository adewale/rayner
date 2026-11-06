// replayMorph's failure says what differs, so an author can fix the edits or the next diagram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayMorphExplained as replayMorph } from '../tools/lib/explain-morph.ts';

const before = { source: 'stateDiagram-v2\n  idle --> busy\n  busy --> off' };
const removeOff = [{ kind: 'remove_transition', from: 'busy', to: 'off' }];

test('a replay that lands on the next diagram passes', () => {
  // Removing a state's last transition keeps the state, declared where it was.
  assert.doesNotThrow(() => replayMorph(before, { source: 'stateDiagram-v2\n  idle --> busy\n  off' }, removeOff));
});

test('a state the edits leave behind is named, with the edit that drops it', () => {
  assert.throws(
    () => replayMorph(before, { source: 'stateDiagram-v2\n  idle --> busy' }, removeOff),
    (e: Error) => /the edits leave state off, which the next diagram does not have/.test(e.message) && /add remove_state/.test(e.message),
  );
  // With remove_state the replay lands.
  assert.doesNotThrow(() => replayMorph(before, { source: 'stateDiagram-v2\n  idle --> busy' }, [...removeOff, { kind: 'remove_state', id: 'off' }]));
});

test('the same facts in another order are reported as an order difference, with the first differing line', () => {
  assert.throws(
    () => replayMorph(before, { source: 'stateDiagram-v2\n  off\n  idle --> busy' }, removeOff),
    (e: Error) => /same facts in a different order/.test(e.message) && /line 2 of the edit result is "idle --> busy" where the next diagram has "off"/.test(e.message),
  );
});

test('a fact the edits do not make is named', () => {
  assert.throws(
    () => replayMorph(before, { source: 'stateDiagram-v2\n  idle --> busy\n  busy --> done\n  off' }, removeOff),
    (e: Error) => /the next diagram has [^;]*edge busy -> done/.test(e.message) && !/remove_state/.test(e.message),
  );
});
