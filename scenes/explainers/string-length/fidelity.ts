import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';
import { WORDS, apart, cutStory, lengths, word } from './model.ts';

/** Every length, code point, byte and cut a step shows is the model's; the model has its own Node and CPython oracles. */
export function check(trace: Trace): void {
  const hi = apart(word('namaste').text), he = apart(word('shalom').text);
  const counts = (w: typeof hi) => ({ text: w.text, bytes: w.bytes, points: w.points, characters: w.characters });
  const shown = (w: typeof hi) => w.parts.map((p) => ({ hex: p.hex, bytes: p.bytes.map((b) => b.toString(16).toUpperCase()), cluster: p.cluster }));
  assertSteps(trace, ['question', 'points', 'bytes', 'characters', 'predict', 'hebrew', 'table', 'cut']);
  // The Hindi word, taken apart and put back together.
  assertStepState(trace, 'question', { ...counts(hi), view: 'whole' });
  assertStepState(trace, 'points', { ...counts(hi), view: 'points', shown: shown(hi) });
  assertStepState(trace, 'bytes', { ...counts(hi), view: 'bytes', shown: shown(hi) });
  assertStepState(trace, 'characters', { ...counts(hi), view: 'characters', shown: shown(hi) });
  // The Hebrew word: its characters while the question is open, then its code points.
  assertStepState(trace, 'predict', { ...counts(he), view: 'characters' });
  assert.equal((trace.steps.find((s) => s.step === 'predict')!.after as { shown?: unknown }).shown, undefined, 'the question does not show the code points');
  assertStepState(trace, 'hebrew', { ...counts(he), view: 'points', shown: shown(he) });
  assertStepState(trace, 'table', { table: WORDS.map((w) => ({ id: w.id, text: w.text, ...lengths(w.text) })) });
  assertStepState(trace, 'cut', { cuts: [cutStory(hi.text, 10, 'bytes'), cutStory(hi.text, 4, 'points'), cutStory(hi.text, 2, 'characters')] });
  const meta = (step: string) => trace.steps.find((s) => s.step === step)!.meta;
  // The prediction's answer is the model's count of code points, between the characters and the bytes offered.
  assert.deepEqual(meta('predict').predict, { options: [String(he.characters), String(he.points), String(he.bytes)], answer: String(he.points) });
  assert.equal(meta('question').title, 'One word, three lengths: 18, 6 and 3');
  assert.match(String(meta('question').caption), /18 bytes, 6 code points, or the 3 characters a reader sees/);
  assert.match(String(meta('bytes').caption), /the first code point, U\+0928, becomes E0 A4 A8, and the six code points become 18 bytes/);
  assert.match(String(meta('hebrew').caption), /four characters are 7 code points, and at two bytes each in UTF-8, 14 bytes\..*is 4 code points and 8 bytes.*still 4 characters/);
  assert.equal(meta('hebrew').line, '4 characters, 7 code points, 14 bytes.');
  assert.match(String(meta('cut').caption), /Keep 10 bytes .* Keep 4 code points .* Keep 2 characters and both are whole/);
}
