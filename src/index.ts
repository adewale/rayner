// The scene vocabulary: what a scene is written with, and nothing else. Drawing a scene's frames
// somewhere is rayner/output (src/output.ts); testing and inspecting one is rayner/testing
// (explain/testing.ts). Internals (colour parsing, animation plumbing, caches) stay module-private
// so they can change without breaking scenes.

// Model
export { Mobject, Group } from './mobject.ts';
export type { Style, StyleRecord, Box, Updater, PathFunc, AnimateBuilder } from './mobject.ts';
export { VMobject } from './vmobject.ts';
export { Arc, Arrow, Circle, CurvedArrow, Dot, Labeled, Line, Polygon, Rectangle } from './shapes.ts';
export type { RectangleOpts, CircleOpts, DotOpts, ArrowOpts, ArcOpts, CurvedArrowOpts } from './shapes.ts';
export { SurroundingRectangle, Cross, Brace, BraceLabel } from './shapes.ts';
export type { SurroundingRectangleOpts, CrossOpts, BraceOpts, BraceLabelOpts } from './shapes.ts';
export { Text, DecimalNumber, Code } from './text.ts';
export type { TextOpts, DecimalNumberOpts, CodeOpts } from './text.ts';
export type { CodeSpan, ColorSpan } from './text.ts';
export { NumberLine, Axes } from './graphing.ts';
export type { AxisRange, NumberLineOpts, AxisStyle, AxesOpts, PlotOpts, BarOpts, GuideLineOpts } from './graphing.ts';

// Motion
export { Animation, Transform, FadeIn, FadeOut, Create, AnimationGroup, LaggedStart } from './animation.ts';
export type { AnimOpts, PlayOpts, Playable, ScheduledAnimation, TransformOpts, FadeOpts, AnimationPhase } from './animation.ts';
export { Circumscribe } from './animation.ts';
export type { CircumscribeOpts } from './animation.ts';
export { Succession } from './animation.ts';
export { GrowFromEdge, PulseAlongPath } from './animation.ts';
export type { GrowFromEdgeOpts } from './animation.ts';
export { TransformMatching, TransformMatchingShapes, TransformMatchingText, matchByKey } from './animation.ts';
export type { MatchKey, MatchingOpts, TransformMatchingOpts, MatchSummary, MatchByKeyOpts } from './animation.ts';
export { TransformDiff } from './animation.ts';
export type { TransformDiffOpts, LinePlan } from './animation.ts';
export { diffLines, parseUnifiedDiff } from './diff.ts';
export type { DiffOp, Hunk } from './diff.ts';
export { linear, smooth, rushInto, rushFrom, thereAndBack } from './rate.ts';
export type { RateFunc } from './rate.ts';
export { Scene, captionWords } from './scene.ts';
export type { Sink, Step, EndedStep, StepMeta, SceneOptions, SceneState, SceneClass } from './scene.ts';
export type { Evidence, Invariant, ScenePhase } from './scene.ts';
// Camera: scene.frame, a box the sinks use as the viewBox
export { Frame } from './frame.ts';
export type { FrameFitOpts } from './frame.ts';

// Vocabulary
export type { Vec } from './vec.ts';
export { lerpColor } from './color.ts';
export type { SceneColors, ColorRole } from './color.ts';
export { shaperFor } from './fonts.ts';
export type { FontName } from './fonts.ts';

// Optional lettering: tree-shaken from scenes which do not request it.
export { MathTex } from './math.ts';
export { ItalicText } from './italic.ts';
export type { LetteringRequest, LetteringStyle } from './lettering-outlines.ts';
// End optional lettering.

export type {JsonValue, JsonObject} from './json.ts';
export type {TextShaping} from './text-context.ts';
