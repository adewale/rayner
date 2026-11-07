// What an explainer's fidelity check (scenes/explainers/<id>/fidelity.ts) is given, and the helpers
// several of them share. test/explain-fidelity.test.ts collects each explainer once and calls its
// check for every authored scenario.
import type { Trace } from '../../src/trace.ts';
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
/** An explainer's fidelity check: every step's state against the program it explains, for one scenario. */
export type FidelityCheck = (trace: Trace, values: Record<string, string>, run: FidelityRun) => void | Promise<void>;

