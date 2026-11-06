export { stage, stagedStep } from './stage.ts';
export type { StageOptions, Stage, StageRegion, Describe, StagedStep, StagedStepsOptions } from './stage.ts';
export type { LayoutDirection } from './layout-direction.ts';
export type {AudioClip, ScoreNote, StepAudio} from './audio.ts';
export { Diagram } from './diagrams.ts';
export type { ShowOptions, NoteSide, PictureNote } from './diagrams.ts';
export { Card, CodeBlock } from './panels.ts';
export type { CardRow, CardOptions, CodeOptions } from './panels.ts';
export { REGIONS, regionBox } from './look.ts';
export type { Region, Emphasis } from './look.ts';
export { palette } from './palettes.ts';
export { mermaid } from './mermaid.ts';
export type { FrontMatterValue, PieSlice, PieOptions } from './mermaid.ts';
export { settingsOf, resolveSettings } from './settings.ts';
export type { Setting, Settings, ExplainerClass } from './settings.ts';
export { diagramsOf } from '../integrations/agentic-mermaid/snapshot.ts';
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
