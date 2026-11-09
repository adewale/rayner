// Pictures of state: a view redrawn from the state, a machine of events and choreography (docs/VIEWS.md, docs/MACHINES.md)
export { view, having } from './view.ts';
export type { View, Having, ViewOptions, ViewPlace, ViewMatch, SyncOptions, TweenOptions } from './view.ts';
export type { FollowSpec } from './state.ts';
export { Machine, refuse, isRefusal } from './machine.ts';
export type { MachineSpec, Transition, Refusal } from './machine.ts';
export type { Choreography } from './choreograph.ts';
export { stage } from './stage.ts';
export type { StageOptions, Stage, StageRegion, Describe, StagedStep, StagedStepsOptions, DiagramPicture } from './stage.ts';
export type { LayoutDirection } from './layout-direction.ts';
export { Diagram } from './diagrams.ts';
export type { Action } from './action.ts';
export type { ShowOptions, Side, PictureNote, DiagramPresentation } from './diagrams.ts';
export type { ToolKind } from './annotate.ts';
export type { Description, DescriptionPart } from './trace.ts';
export { regionBox } from './look.ts';
export type { Region, Look } from './look.ts';
export { palette } from './palettes.ts';
export { mermaid } from './mermaid.ts';
export type { FrontMatterValue, PieSlice, PieOptions } from './mermaid.ts';
export { settingsOf, resolveSettings } from './settings.ts';
export { answerOf } from './script.ts';
export type { StepKind } from './script.ts';
export type { Setting, Settings, ExplainerClass, ExplainerMeta, PlayerMeta } from './settings.ts';
export type { AudioClip, ScoreNote, StepAudio } from './audio.ts';
export { diagramResolverOf } from './diagram-snapshot.ts';
export type {
  DiagramSpec,
  DiagramSnapshot,
  SnapshotStore,
  Finding,
  Findings,
  DiagramResolver,
  MutationOp,
} from './diagram-snapshot.ts';
