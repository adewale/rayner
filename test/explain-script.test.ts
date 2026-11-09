// The script gate: meta.answer stated by some teaching step, where reported; meta.questions well formed (explain/script.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerStep, checkScriptMeta, checkStepMeta, normalise, scriptReport, QUESTIONS_MAX } from '../explain/script.ts';

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

test('reference steps are not teaching steps: the answer is counted among the steps the reader steps through', () => {
  const withDetail = [step('ref', { title: 'Source notes', kind: 'detail', caption: 'LRU evicts the item used longest ago.' }), ...steps];
  assert.deepEqual(answerStep('LRU evicts the item used longest ago', withDetail), { step: 'rule', at: 2 });
});

test('the gate fails an answer no step states, reports where a stated one first appears, and reports what is undeclared', () => {
  assert.deepEqual(scriptReport({ answer: 'LRU evicts the item used longest ago', questions: [{ question: 'Q?', answer: 'A.' }] }, steps), {
    answer: { step: 'rule', at: 2 },
    questions: 1,
    missing: [],
    problems: [],
  });
  // A late answer is reported, not failed: whether it comes before the elaboration is a reader's call.
  const late = scriptReport({ answer: 'And so on' }, steps);
  assert.deepEqual(late.problems, []);
  assert.deepEqual(late.answer, { step: 'more', at: 3 });
  assert.deepEqual(late.missing, ['questions']);
  assert.match(scriptReport({ answer: 'Never said' }, steps).problems[0]!, /No step states meta.answer/);
  assert.deepEqual(scriptReport(undefined, steps), { questions: 0, missing: ['answer', 'questions'], problems: [] });
});

test('collection refuses a step whose title or line is not a string or whose kind is not short, main or detail, naming the step', () => {
  checkStepMeta([...steps, step('aside', { kind: 'detail' }), step('first', { kind: 'short', line: 'A line' })]);
  for (const meta of [{ title: false }, { line: [] }, { kind: 'yes' }])
    assert.throws(() => checkStepMeta([...steps, step('bad', meta)]), /^(TypeError|RangeError): this\.step\(\): the (title|line|kind) of step "bad" must be/);
  // The old flags are refused by name, so a scene written for them says what to write instead.
  for (const meta of [{ detail: true }, { reader: true }])
    assert.throws(() => checkStepMeta([step('bad', meta)]), /this\.step\(\): step "bad" has (detail|reader)/);
});

test('malformed script meta is refused', () => {
  assert.throws(() => checkScriptMeta({ answer: ' ' }), /meta.answer/);
  assert.throws(() => checkScriptMeta({ questions: [] }), /list of/);
  assert.throws(() => checkScriptMeta({ questions: [{ question: 'Q?' }] }), /has no answer/);
  assert.throws(() => checkScriptMeta({ questions: [{ answer: 'A' }] }), /has no question/);
  assert.throws(() => checkScriptMeta({ questions: Array.from({ length: QUESTIONS_MAX + 1 }, () => ({ question: 'Q', answer: 'A' })) }), /at most/);
  assert.doesNotThrow(() => checkScriptMeta({ answer: 'Yes.', questions: [{ question: 'Q?', answer: 'A.' }] }));
});
