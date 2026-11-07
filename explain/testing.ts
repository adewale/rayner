// rayner/testing: author tooling. What an author's tests, scripts and tools use to run, trace,
// describe and check a scene, and what rayner itself is built on; no scene imports it
// (test/scene-imports.test.ts). The scene vocabulary is rayner, rayner/explain and rayner/drawing;
// drawing frames outside the page is rayner/output.

export * from '../src/testing.ts';
export { describeExplainer } from './describe.ts';
export type { ExplainerDescription, ScenarioDescription, StepDescription, DescribeOptions } from './describe.ts';
export { scenariosOf, scenarioName, withSettings, bindSnapshots } from './settings.ts';
export { withIntent } from './intent.ts';
export { viewMismatch } from './view.ts';
export { machinesOf } from './machine.ts';
export { loadProject, loadSnapshots } from './project.ts';
export type { LoadedProject, LoadedScenario } from './project.ts';
export { pictureWordsAt } from './trace.ts';
export type { PictureWords } from './trace.ts';
export { diagramFindings } from '../integrations/agentic-mermaid/snapshot.ts';
