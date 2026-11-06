// Step ids for tests, read from the scene rather than copied from it. A test that pins an
// explainer's whole list of steps breaks at every edit to the story, though its point is usually a
// few steps it reads by name. Ask the scene for its steps (stepIdsOf, idsOf), and assert only the
// steps the test reads (assertSteps); pin the whole list only when the list is the point.
import assert from 'node:assert/strict';
import { traceScene } from '../../explain/testing.ts';
import type { Trace } from '../../explain/testing.ts';
import type { StepKind } from '../../src/index.ts';
import type { SceneClass } from '../../src/index.ts';

/** A path through the steps: one kind, or 'story', every step but the details. */
export type Path = StepKind | 'story';
const on = (kind: StepKind, path: Path) => (path === 'story' ? kind !== 'detail' : kind === path);

/** The trace's step ids, in order; with a path, only the steps on it. */
export function idsOf(trace: Trace, path?: Path): string[] {
  return trace.steps.filter((s) => !path || on(s.meta.kind ?? 'main', path)).map((s) => s.step);
}

/** The step ids a scene runs, in order, from a trace of it (bind a scenario with withSettings first). */
export async function stepIdsOf(Scene: SceneClass, path?: Path): Promise<string[]> {
  return idsOf(await traceScene(Scene), path);
}

/** Fail unless each of `names` is a step of the trace, in this order, other steps allowed between them. */
export function assertSteps(trace: Trace, names: readonly string[], path?: Path): void {
  const ids = idsOf(trace, path);
  let at = 0;
  for (const name of names) {
    const found = ids.indexOf(name, at);
    assert.ok(found >= 0, `no step "${name}"${path ? ` on the ${path} path` : ''} after "${ids[at - 1] ?? 'the start'}": the steps are ${ids.join(', ')}`);
    at = found + 1;
  }
}
