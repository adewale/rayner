export { stage } from './stage.ts';
export { stagedStepsOf } from './stage.ts';
export type { StageOptions, Stage, StageRegion, Describe, StagedStep, StagedStepsOptions, StagedRecord } from './stage.ts';
export type { LayoutDirection } from './layout-direction.ts';
export type {AudioClip, ScoreNote, StepAudio} from './audio.ts';
export { Diagram } from './diagrams.ts';
export type { ShowOptions, NoteSide } from './diagrams.ts';
export { Card } from './panels.ts';
export type { CodeBlock, CardRow, CardOptions, CodeOptions } from './panels.ts';
export { REGIONS, regionBox } from './look.ts';
export type { Region, Emphasis } from './look.ts';
export { palette } from './palettes.ts';
export { settingsOf, withSettings, resolveSettings, scenariosOf, scenarioName } from './settings.ts';
export { describeExplainer } from './describe.ts';
export type { ExplainerDescription, ScenarioDescription, StepDescription, DescribeOptions } from './describe.ts';
export type { Setting, Settings, ExplainerClass } from './settings.ts';
export { findingsOf, edgePartOf, diagramsOf } from '../integrations/agentic-mermaid/snapshot.ts';
export type {
  DiagramSpec,
  DiagramSnapshot,
  SnapshotStore,
  Palette,
  Finding,
  Findings,
  DiagramResolver,
  MutationOp,
} from '../integrations/agentic-mermaid/snapshot.ts';
import type { ExplainerClass } from './settings.ts';
import type { SceneClass } from '../src/index.ts';
import type { SnapshotStore, DiagramResolver } from '../integrations/agentic-mermaid/snapshot.ts';
import { useDiagrams, snapshotResolver } from '../integrations/agentic-mermaid/snapshot.ts';

/** A subclass whose diagrams come from `source`: pinned snapshots, or a resolver that captures them. */
export function bindSnapshots(Source: ExplainerClass, source: SnapshotStore | DiagramResolver): ExplainerClass {
  const resolver = typeof source.diagram === 'function' ? (source as DiagramResolver) : snapshotResolver(source as SnapshotStore);
  return class extends Source {
    constructor(...args: ConstructorParameters<SceneClass>) {
      super(...args);
      useDiagrams(this, resolver);
    }
  };
}
