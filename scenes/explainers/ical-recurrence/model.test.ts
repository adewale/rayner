import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUEST, GUEST_MEETING, INVITED, deliver, expand, guestCopy, messageFor } from './model.ts';
import { BOB, FIFTH_LEFT, RULE_STARTS, SKIP_FIFTH } from './answers.ts';

test('the check answers’ words: the last meeting stays the rule’s sixth start, Bob keeps his meeting, and his copy has no RRULE', () => {
  // The answers' words: the last meeting is still the rule's sixth start; the update Bob is sent keeps his
  // meeting uncancelled; his copy has no RRULE.
  assert.equal(FIFTH_LEFT.at(-1)!.start, RULE_STARTS.at(-1));
  const message = messageFor(INVITED, SKIP_FIFTH, GUEST);
  const bobAfter = message ? (deliver(message, guestCopy('none').copy) ?? []) : [];
  assert.deepEqual(expand(bobAfter).map((m) => [m.start, m.cancelled]), [[GUEST_MEETING, false]]);
  assert.equal(BOB.rrules, 0);
});
