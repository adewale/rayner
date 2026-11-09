// Step ids for the repository's tests, read from the scene rather than copied from it. A test that
// pins an explainer's whole list of steps breaks at every edit to the story, though its point is
// usually a few steps it reads by name: assert those with assertSteps (rayner/testing), and pin the
// whole list, from idsOf or stepIdsOf, only when the list is the point.
import { traceScene } from '../../explain/testing.ts';
import type { StepPath, Trace } from '../../explain/testing.ts';
import type { SceneClass } from '../../src/index.ts';

/** The trace's step ids, in order; with a path, only the steps on it. */
export function idsOf(trace: Trace, path?: StepPath): string[] {
  return trace.steps.filter((s) => !path || (path === 'story' ? s.meta.kind !== 'detail' : (s.meta.kind ?? 'main') === path)).map((s) => s.step);
}

/** The step ids a scene runs, in order, from a trace of it (bind a scenario with withSettings first). */
export async function stepIdsOf(Scene: SceneClass, path?: StepPath): Promise<string[]> {
  return idsOf(await traceScene(Scene), path);
}
