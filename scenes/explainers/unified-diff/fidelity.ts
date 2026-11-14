import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';
import { AFTER, BEFORE, COPIES, HUNK, LOOKALIKE, NAME, apply, header, oldSide, report, sectionAt } from './model.ts';
import type { CopyId } from './model.ts';

/** Every file, place and message a step shows is the model's, in both copies; the model's own test runs Git on each. */
export function check(trace: Trace, values: Record<string, string>): void {
  const copy = [...COPIES[values.copy as CopyId]], head = header(HUNK);
  const made = apply(BEFORE, [HUNK]), yours = apply(copy, [HUNK]), wrong = apply(LOOKALIKE, [HUNK]);
  assert.ok(made.ok && wrong.ok);
  assertSteps(trace, ['patch', 'header', 'apply', 'yours', 'search', 'result', 'wrong']);
  for (const step of trace.steps) assertStepState(trace, step.step, { header: head });
  // The author's file, and the patch applied to it where its header says.
  for (const step of ['patch', 'header']) assertStepState(trace, step, { file: BEFORE });
  assertStepState(trace, 'apply', { file: BEFORE, tried: [2], at: 2, offset: 0, applied: true, result: AFTER, report: report(made, NAME) });
  // The reader's copy: untouched while the question is open, then searched, then applied or refused.
  assertStepState(trace, 'yours', { file: copy });
  const tried = yours.ok ? yours.placements[0]!.tried : yours.tried, at = yours.ok ? yours.placements[0]!.at : null;
  assertStepState(trace, 'search', { file: copy, tried, at });
  assertStepState(trace, 'result', { file: copy, tried, at, applied: yours.ok, report: yours.ok ? report(yours, NAME) : report(yours, NAME, oldSide(HUNK)).slice(-2) });
  const result = trace.steps.find((s) => s.step === 'result')!.after as { result?: string[]; offset?: number };
  if (yours.ok) assert.deepEqual([result.result, result.offset], [yours.file, yours.placements[0]!.offset]);
  else assert.equal(result.result, undefined, 'a refused patch leaves no result');
  // The lookalike: applied at the hunk's own line, in the other section.
  assertStepState(trace, 'wrong', { file: LOOKALIKE, at: wrong.placements[0]!.at, offset: 0, applied: true, result: wrong.file, landed: sectionAt(LOOKALIKE, 2), meant: sectionAt(BEFORE, 2), report: report(wrong, NAME) });
  const meta = (step: string) => trace.steps.find((s) => s.step === step)!.meta;
  assert.equal(meta('yours').predict?.answer, !yours.ok ? 'Not at all' : yours.placements[0]!.offset ? 'At another line' : 'At line 2');
  if (values.copy === 'moved') {
    assert.equal(meta('search').title, 'Git tries lines 2, 3, 1 and 4 and finds the hunk at line 4');
    assert.equal(meta('result').line, 'git apply -v: “Hunk #1 succeeded at 4 (offset 2 lines).”');
    assert.match(String(meta('search').caption), /an offset of 2 from where it was sent/);
  } else {
    assert.equal(meta('search').title, 'Git tries lines 2, 3, 1 and 4: the hunk fits nowhere');
    assert.equal(meta('result').line, 'git apply: “error: patch failed: app.ini:2”');
    assert.match(String(meta('search').caption), /The frame returns to line 2, the line Git will name/);
  }
  assert.match(String(meta('wrong').caption), /at line 2 and Git applies it without a word: to \[admin\], though the author changed \[web\]/);
}
