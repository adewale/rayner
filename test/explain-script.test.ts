// The script gate: meta.answer stated by some teaching step, where reported; meta.questions well formed (explain/script.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerStep, captionWords, checkScriptMeta, normalise, scriptReport, CAPTION_WORDS_MAX, QUESTIONS_MAX } from '../explain/script.ts';

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

test('a caption is counted as a reader counts words: runs between spaces holding a letter or a digit', () => {
  assert.equal(captionWords(''), 0);
  assert.equal(captionWords('One sentence, two clauses.'), 4);
  // A contraction, a hyphenated word, an address, a call and a multiplier are one word each; a dash or arrow alone is none.
  assert.equal(captionWords("don't  x-ray 10.0.0.1 O(n) 3× — → ."), 5);
  assert.equal(captionWords('a\nb\tc'), 3);
  // A no-break space holds a number's groups, or a number and its unit, together, as the page does.
  assert.equal(captionWords('les mêmes 65\u202f673,88\u00a0€ à 30\u00a0%'), 5);
  assert.equal(captionWords('les mêmes 65 673,88 € à 30 %'), 6);
});

test('the gate fails a step whose caption runs over the limit, naming the step and the count, detail steps included', () => {
  assert.equal(CAPTION_WORDS_MAX, 80);
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ') + '.';
  const at = (n: number, meta: Record<string, unknown> = {}) => scriptReport(undefined, [step('long', { caption: words(n), ...meta })]).problems;
  assert.deepEqual(at(80), []);
  assert.deepEqual(at(81), ['Step "long" has a caption of 81 words, over 80; keep its point in the first sentence and cut the rest, or give it a step of its own']);
  assert.equal(at(120, { kind: 'detail' }).length, 1);
  // Punctuation standing alone is not a word: 80 words with dashes between them pass.
  assert.deepEqual(scriptReport(undefined, [step('dashes', { caption: words(80).split(' ').join(' — ') })]).problems, []);
});

test('malformed script meta is refused', () => {
  assert.throws(() => checkScriptMeta({ answer: ' ' }), /meta.answer/);
  assert.throws(() => checkScriptMeta({ questions: [] }), /list of/);
  assert.throws(() => checkScriptMeta({ questions: [{ question: 'Q?' }] }), /has no answer/);
  assert.throws(() => checkScriptMeta({ questions: [{ answer: 'A' }] }), /has no question/);
  assert.throws(() => checkScriptMeta({ questions: Array.from({ length: QUESTIONS_MAX + 1 }, () => ({ question: 'Q', answer: 'A' })) }), /at most/);
  assert.doesNotThrow(() => checkScriptMeta({ answer: 'Yes.', questions: [{ question: 'Q?', answer: 'A.' }] }));
});
