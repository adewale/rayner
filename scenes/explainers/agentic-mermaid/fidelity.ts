import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { pictureHtml } from '../../../explain/trace.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { textOf } from '../../../test/lib/fidelity.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { scenario }: FidelityRun): Promise<void> {
  const warnings = trace.steps.find((s) => s.step === 'verify')!.after!.warnings as unknown[];
  assert.equal(warnings.length, values.edit === 'missing' ? 2 : 0);
  // The swapped labels draw the wrong diagram and the verifier still finds nothing.
  assertStepState(trace, 'meaning', { swappedWarnings: 0 });
  // The aha: the wrong diagram and the right one get the same report.
  assertStepState(trace, 'meaning', {
    reports: { wrong: { ok: true, warnings: 0 }, right: { ok: true, warnings: 0 } },
  });
  // Both diagrams on show at once, each traced from its own yes label: a cache hit ends at Database in the
  // wrong one and at Reply in the right one, while the verifier's lines in the two reports beside them are the same.
  assertStepState(trace, 'meaning', {
    hit: { wrong: { edge: 'edge:A->C#0', node: 'Database' }, right: { edge: 'edge:A->B#0', node: 'Reply' } },
  });
  {
    const shown = textOf(pictureHtml(trace.steps.find((s) => s.step === 'meaning')!.shown)).replace(/\s+/g, ' ');
    for (const heading of ['1: yes to Database;', '1: yes to Reply;']) assert.ok(shown.includes(heading), shown);
    const body = '2: ok: true; 3: warnings: 0';
    assert.equal(shown.split(body).length - 1, 2, shown);
  }
  // The default scenario deletes the swapped labels to show what the verifier does flag.
  if (values.edit === 'swapped') assertStepState(trace, 'flagged', { flaggedWarnings: 2 });
  // Every scenario shows an error turning ok false: the edge to Database cut off at its arrow.
  assertStepState(trace, 'broken', {
    broken: {
      source: {
        swapped: 'graph LR\nA{Cached} -->|no| B[Reply]\nA -->|yes|',
        missing: 'graph LR\nA{Cached} --> B[Reply]\nA -->',
        complete: 'graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no|',
      }[values.edit!],
      ok: false,
      warnings: [
        { code: 'RENDER_FAILED', severity: 'error' },
        { code: 'UNSUPPORTED_SYNTAX', severity: 'warning', syntax: 'flowchart_dangling_edge' },
      ],
      checks: { renderability: 'failed', taskCorrectness: 'not-checked' },
    },
  });
  // The verifier's own scope line, read from the snapshot of the first edit.
  assertStepState(trace, 'verify', { taskCorrectness: 'not-checked' });
  assertStepState(trace, 'history', { finalWarnings: 0 });
}
