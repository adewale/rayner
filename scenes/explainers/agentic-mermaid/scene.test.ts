import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findingsOf } from '../../../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';
import { verifyMermaid, WARNING_SEVERITY } from 'agentic-mermaid/agent';
import MermaidExplainer, { BROKEN, BROKEN_REPORT } from './scene.ts';
import { explainerMeta } from '../../../tools/lib/explain-intent.ts';
import { readSnapshots } from '../../../tools/lib/explain-project.ts';

/** This explainer's pinned snapshots, as test/explain-real.test.ts reads the collection's. */
const corpus: { id: string; s: DiagramSnapshot }[] = [];
for (const s of Object.values(await readSnapshots('scenes/explainers/agentic-mermaid/scene'))) corpus.push({ id: 'agentic-mermaid', s });

/** The pinned snapshot of explainer `id` whose source contains `text`. */
const pinned = (id: string, text: string) => {
  const found = corpus.find((c) => c.id === id && c.s.spec.source.includes(text));
  assert.ok(found, `no pinned ${id} diagram with ${text}`);
  return found.s;
};

test('the Mermaid explainer’s check answers are what the pinned verifier reports on each check’s diagram', () => {
  // The swapped labels and the right ones: both captured snapshots carry ok: true and no warnings.
  for (const text of ['A -->|yes| C[Database]', 'A{Cached} -->|yes| B[Reply]']) {
    const s = pinned('agentic-mermaid', text);
    assert.equal(s.findings.ok, true);
    assert.deepEqual(findingsOf(s), []);
  }
  const report = (source: string) => {
    const r = verifyMermaid(source);
    return { ok: r.ok, warnings: (r.warnings ?? []).map((w) => `${w.code} ${(w as { edge?: string }).edge}`) };
  };
  const [undeclared, second, rectangle, single] = explainerMeta(MermaidExplainer, 'scenes/explainers/agentic-mermaid').checks!;
  // Both edges labelled yes: the verifier does not compare what labels say (no longer a check question; the claim stands).
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|yes| C[Database]'), { ok: true, warnings: [] });
  // A node used only as an edge's target: Mermaid creates it as a rectangle labelled with its id.
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| D'), { ok: true, warnings: [] });
  const d = verifyMermaid('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| D').layout.nodes.find((n) => n.id === 'D');
  assert.deepEqual([d?.shape, d?.label], ['rectangle', 'D']);
  assert.match(undeclared!.answer, /^ok: true and no warnings\. Mermaid creates D where it is first used, as a rectangle labelled D/);
  // A third, unlabelled route out of Cached (no longer a check question; the claim stands).
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]\nA --> D[Stale]'), {
    ok: true,
    warnings: ['DECISION_BRANCH_UNLABELED A->D#0'],
  });
  // A second edge between the same two nodes takes the next count: A->C#1.
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]\nA --> C'), {
    ok: true,
    warnings: ['DECISION_BRANCH_UNLABELED A->C#1'],
  });
  assert.match(second!.answer, /^A->C#1\. .*One DECISION_BRANCH_UNLABELED warning, and ok stays true\.$/);
  assert.deepEqual(report('graph LR\nA[Cached] --> B[Reply]\nA --> C[Database]'), { ok: true, warnings: [] });
  assert.match(rectangle!.answer, /^No: ok: true with no warnings/);
  // A decision with one exit: its unlabelled exit is not flagged, since the warning needs two or more exits.
  assert.deepEqual(report('graph LR\nA{Cached} --> B[Reply]'), { ok: true, warnings: [] });
  assert.match(single!.answer, /^None: ok: true with no warnings\. The warning is for a decision with two or more exits/);
  // A bare graph header: Agentic Mermaid's renderer rejects it (no longer a check question, since what mermaid-js
  // accepts cannot be tested here; the claim about the pinned verifier stands).
  const headless = verifyMermaid('graph\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]');
  assert.equal(headless.ok, false);
  assert.deepEqual(headless.warnings.map((w) => [w.code, WARNING_SEVERITY[w.code]]), [['RENDER_FAILED', 'error']]);
});

test('the Mermaid explainer’s broken step shows what the pinned verifier reports for an edge with no end, in every scenario', () => {
  // These sources cannot be captured (capture refuses ok: false), so the step's report is written in the scene and held here.
  assert.deepEqual(Object.keys(BROKEN).sort(), ['complete', 'missing', 'swapped']);
  for (const [edit, source] of Object.entries(BROKEN)) {
    assert.match(source, /-->(\|(yes|no)\|)?$/, `${edit}: the last edge stops at its arrow`);
    const r = verifyMermaid(source);
    const got = {
      ok: r.ok,
      warnings: r.warnings.map((w) => ({
        code: w.code,
        severity: WARNING_SEVERITY[w.code],
        ...((w as { syntax?: string }).syntax ? { syntax: (w as { syntax?: string }).syntax } : {}),
      })),
      checks: { renderability: r.checks?.renderability, taskCorrectness: r.checks?.taskCorrectness },
    };
    assert.deepEqual(got, BROKEN_REPORT, edit);
  }
});
