// The script gate: meta.answer stated by step 2, meta.checks well formed (explain/script.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerStep, checkScriptMeta, normalise, scriptReport, CHECKS_MAX } from '../explain/script.ts';

const step = (name: string, meta: Record<string, unknown>) => ({ step: name, meta });
const steps = [
  step('open', { title: 'Two policies', caption: 'A cache must choose what to drop.' }),
  step('rule', { title: 'Opposite ends', caption: 'LRU evicts the item used longest ago, A.' }),
  step('more', { title: 'More', caption: 'And so on.' }),
];

test('an answer is found in the title, line or caption, ignoring case, quotes, spacing and final punctuation', () => {
  assert.deepEqual(answerStep('lru evicts the item used  longest ago.', steps), { step: 'rule', at: 2 });
  assert.deepEqual(answerStep('Two policies', steps), { step: 'open', at: 1 });
  assert.deepEqual(answerStep('A statechart can’t', [step('a', { line: "A statechart can't do more" })]), { step: 'a', at: 1 });
  assert.equal(answerStep('MRU evicts the newest', steps), null);
  assert.equal(normalise(' The  “Answer”! '), 'the "answer"');
});

test('reference steps are not teaching steps: the answer must come within the first two the reader steps through', () => {
  const withDetail = [step('ref', { title: 'Source notes', detail: true, caption: 'LRU evicts the item used longest ago.' }), ...steps];
  assert.deepEqual(answerStep('LRU evicts the item used longest ago', withDetail), { step: 'rule', at: 2 });
});

test('the gate fails an answer that arrives after step 2 or never, and reports what is undeclared', () => {
  assert.deepEqual(scriptReport({ answer: 'LRU evicts the item used longest ago', checks: [{ question: 'Q?', answer: 'A.' }] }, steps), {
    answer: { step: 'rule', at: 2 },
    checks: 1,
    missing: [],
    problems: [],
  });
  const late = scriptReport({ answer: 'And so on' }, steps);
  assert.equal(late.problems.length, 1);
  assert.match(late.problems[0]!, /step 3 \("more"\).*by step 2/);
  assert.deepEqual(late.missing, ['checks']);
  assert.match(scriptReport({ answer: 'Never said' }, steps).problems[0]!, /No step states meta.answer/);
  assert.deepEqual(scriptReport(undefined, steps), { checks: 0, missing: ['answer', 'checks'], problems: [] });
});

test('malformed script meta is refused', () => {
  assert.throws(() => checkScriptMeta({ answer: ' ' }), /meta.answer/);
  assert.throws(() => checkScriptMeta({ checks: [] }), /list of/);
  assert.throws(() => checkScriptMeta({ checks: [{ question: 'Q?' }] }), /has no answer/);
  assert.throws(() => checkScriptMeta({ checks: [{ answer: 'A' }] }), /has no question/);
  assert.throws(() => checkScriptMeta({ checks: Array.from({ length: CHECKS_MAX + 1 }, () => ({ question: 'Q', answer: 'A' })) }), /at most/);
  assert.doesNotThrow(() => checkScriptMeta({ answer: 'Yes.', checks: [{ question: 'Q?', answer: 'A.' }] }));
});
