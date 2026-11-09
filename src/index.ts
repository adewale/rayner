// The scene vocabulary: what a scene is written with, and nothing else. Drawing a scene's frames
// somewhere is rayner/output (src/output.ts); testing and inspecting one is rayner/testing
// (explain/testing.ts). Internals (colour parsing, animation plumbing, caches) stay module-private
// so they can change without breaking scenes.

// Model
export { Mobject, Group, keyed } from './mobject.ts';
export type { Style, StyleRecord, Box, Updater, AnimateBuilder } from './mobject.ts';
export { VMobject } from './vmobject.ts';
export { Arc, ArcBetweenPoints, Arrow, Circle, CurvedArrow, Dot, Labeled, Line, Polygon, Rectangle } from './shapes.ts';
export type { RectangleOptions, CircleOptions, DotOptions, ArrowOptions, ArcOptions, CurvedArrowOptions } from './shapes.ts';
export { SurroundingRectangle, Cross, Brace, BraceLabel } from './shapes.ts';
export type { SurroundingRectangleOptions, CrossOptions, BraceOptions, BraceLabelOptions } from './shapes.ts';
export { Text, DecimalNumber, Code } from './text.ts';
export type { TextOptions, DecimalNumberOptions, CodeOptions } from './text.ts';
export type { CodeSpan, ColorSpan } from './text.ts';
export { NumberLine, Axes } from './graphing.ts';
export type { AxisRange, NumberLineOptions, AxisStyle, AxesOptions, PlotOptions, BarOptions, GuideLineOptions } from './graphing.ts';

// Motion
export { Animation, Transform, FadeIn, FadeOut, Create, AnimationGroup, LaggedStart } from './animation.ts';
export { Restore, TransformFromCopy, MoveAlongPath } from './animation.ts';
export type { MoveAlongPathOptions } from './animation.ts';
export type { AnimOptions, PlayOptions, Playable, ScheduledAnimation, TransformOptions, FadeOptions, AnimationPhase } from './animation.ts';
export { Circumscribe } from './animation.ts';
export type { CircumscribeOptions } from './animation.ts';
export { Succession } from './animation.ts';
export { GrowFromEdge, PulseAlongPath } from './animation.ts';
export type { GrowFromEdgeOptions } from './animation.ts';
export { TransformMatching, TransformMatchingShapes, TransformMatchingText, matchByKey } from './animation.ts';
export type { MatchKey, MatchingOptions, TransformMatchingOptions, MatchSummary, MatchByKeyOptions } from './animation.ts';
export { TransformDiff } from './animation.ts';
export type { TransformDiffOptions, LinePlan } from './animation.ts';
export { diffLines, parseUnifiedDiff } from './diff.ts';
export type { DiffOp, Hunk } from './diff.ts';
export { linear, smooth, rushInto, rushFrom, thereAndBack } from './rate.ts';
export type { RateFunc } from './rate.ts';
export { Scene } from './scene.ts';
export type { Sink, Step, EndedStep, StepMeta, SceneOptions, SceneState, SceneClass } from './scene.ts';
export type { Evidence, Invariant, ScenePhase } from './scene.ts';
// Camera: scene.frame, a box the sinks use as the viewBox
export { Frame } from './frame.ts';
export type { FrameFitOptions } from './frame.ts';

// Vocabulary
export type { Vec } from './vec.ts';
export { lerpColor } from './color.ts';
export type { SceneColors, ColorRole, Palette } from './color.ts';
export { shaperFor } from './fonts.ts';
export type { FontName } from './fonts.ts';

// Optional lettering: tree-shaken from scenes which do not request it.
export { MathTex } from './math.ts';
export { ItalicText } from './italic.ts';
export type { LetteringRequest, LetteringStyle } from './lettering-outlines.ts';
// End optional lettering.

export type {JsonValue, JsonObject} from './json.ts';
export type {TextShaping} from './text-context.ts';
