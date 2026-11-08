// What an explainer's fidelity check (scenes/explainers/<id>/fidelity.ts) is given, and the helpers
// several of them share. test/explain-fidelity.test.ts collects each explainer once and calls its
// check for every authored scenario.
import type { TraceOf } from '../../src/trace.ts';
import type { SceneClass } from '../../src/scene.ts';
import type { Project } from '../../tools/lib/explain-project.ts';

/** A link the trace says a token walked, from a captured diagram. */
export interface Walk {
  step: string;
  from: string;
  to: string;
  edge: string;
}
/** One scenario's run, with the collected project it came from and the links its tokens walked. */
export interface FidelityRun {
  scenario: Project['scenarios'][number];
  project: Project;
  walks: Walk[];
}
/**
 * An explainer's fidelity check: every step's state against the program it explains, for one
 * scenario. A check whose steps hold the scene's model declares its trace typed from the scene,
 * `trace: TraceOf<typeof Explainer>` (`FidelityCheck<typeof Explainer>`); one that reads a staged
 * step's own state takes a plain Trace.
 */
export type FidelityCheck<C = SceneClass> = (trace: TraceOf<C>, values: Record<string, string>, run: FidelityRun) => void | Promise<void>;

