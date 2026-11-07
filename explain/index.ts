// Pictures of state: a view redrawn from the state, a machine of events and choreography (docs/VIEWS.md, docs/MACHINES.md)
export { View, view, having } from './view.ts';
export type { Having, ViewSync, ViewOpts, ViewPlace, ViewMatch, SyncOpts } from './view.ts';
export type { FollowSpec } from './state.ts';
export { Machine, refuse, isRefusal } from './machine.ts';
export type { MachineSpec, Transition, Outcome, Refusal } from './machine.ts';
export type { Choreography } from './choreograph.ts';
export { stage } from './stage.ts';
export type { StageOptions, Stage, StageRegion, Describe, StagedStep, StagedStepsOptions, DiagramPicture } from './stage.ts';
export type { LayoutDirection } from './layout-direction.ts';
export { Diagram } from './diagrams.ts';
export type { ShowOptions, NoteSide, PictureNote } from './diagrams.ts';
export type { Card, CodeBlock, CardRow, CardOptions, CodeOptions } from './panels.ts';
export type { Description, DescriptionPart } from './trace.ts';
export { regionBox } from './look.ts';
export type { Region, Look, Palette } from './look.ts';
export { palette } from './palettes.ts';
export { mermaid } from './mermaid.ts';
export type { FrontMatterValue, PieSlice, PieOptions } from './mermaid.ts';
export { settingsOf, resolveSettings } from './settings.ts';
export { answerOf } from './script.ts';
export type { StepKind } from './script.ts';
export type { Setting, Settings, ExplainerClass } from './settings.ts';
export { diagramsOf } from '../integrations/agentic-mermaid/snapshot.ts';
export type {
  DiagramSpec,
  DiagramSnapshot,
  SnapshotStore,
  Finding,
  Findings,
  DiagramResolver,
  MutationOp,
} from '../integrations/agentic-mermaid/snapshot.ts';
