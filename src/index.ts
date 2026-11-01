// Public API. Everything a scene, a player or a tool needs, and nothing else:
// internals (color parsing, animation plumbing, caches) stay module-private
// so they can change without breaking scenes.

// Model
export { Mobject, Group } from './mobject.ts';
export type { Style, StyleRecord, Box, Updater, PathFunc, AnimateBuilder } from './mobject.ts';
export { VMobject } from './vmobject.ts';
export { Arc, ArcBetweenPoints, Arrow, Circle, CurvedArrow, Dot, Labeled, Line, Polygon, Rectangle, Square } from './shapes.ts';
export type { RectangleOpts, SquareOpts, CircleOpts, DotOpts, ArrowOpts, ArcOpts, CurvedArrowOpts } from './shapes.ts';
export { SurroundingRectangle, Underline, Cross, Brace, BraceLabel } from './shapes.ts';
export type { SurroundingRectangleOpts, UnderlineOpts, CrossOpts, BraceOpts, BraceLabelOpts } from './shapes.ts';
export { Text, DecimalNumber, Code } from './text.ts';
export type { TextOpts, DecimalNumberOpts, CodeOpts } from './text.ts';
export type { CodeSpan, ColorSpan } from './text.ts';
export { StateReadout } from './panels.ts';
// Views: a picture rebuilt from state, changed by matching transforms (docs/VIEWS.md)
export { View, ViewSync, view, stateView, viewMismatch } from './view.ts';
export type { ViewOpts, ViewPlace, ViewMatch, SyncOpts, StateViewOpts } from './view.ts';
export { NumberLine, Axes } from './graphing.ts';
export type { AxisRange, NumberLineOpts, AxisStyle, AxesOpts, PlotOpts, BarOpts, GuideLineOpts } from './graphing.ts';

// Motion
export { Animation, Transform, FadeIn, FadeOut, Create, Write, Indicate, Flash, MoveAlongPath, AnimationGroup, LaggedStart } from './animation.ts';
export type { AnimOpts, PlayOpts, Playable, ScheduledAnimation, TransformOpts, FadeOpts, IndicateOpts, MoveAlongPathOpts } from './animation.ts';
export { Circumscribe } from './animation.ts';
export type { CircumscribeOpts } from './animation.ts';
export { Restore, TransformFromCopy, Succession } from './animation.ts';
export { TransformMatching, TransformMatchingShapes, TransformMatchingText } from './animation.ts';
export type { MatchKey, MatchingOpts, TransformMatchingOpts, MatchSummary } from './animation.ts';
export { TransformDiff } from './animation.ts';
export type { TransformDiffOpts, LinePlan } from './animation.ts';
export { diffLines, diffTokens, parseUnifiedDiff, tokenize, hunkHeader } from './diff.ts';
export type { DiffOp, Hunk, Token, TokenOp } from './diff.ts';
export { linear, smooth, rushInto, rushFrom, thereAndBack, easeInQuad, easeOutQuad, easeOutBack, wiggle } from './rate.ts';
export type { RateFunc } from './rate.ts';
export { Scene, StopScene } from './scene.ts';
export type { Sink, Step, StepMeta, SceneOptions, SceneState, SceneClass } from './scene.ts';
export type { Evidence } from './scene.ts';
// Camera: scene.frame, a box the sinks use as the viewBox
export { Frame } from './frame.ts';
export type { FrameFitOpts } from './frame.ts';

// Vocabulary
export { ORIGIN, UP, DOWN, LEFT, RIGHT, UL, UR, DL, DR, add, sub, mul, dot, norm, normalize, lerp, rotate, angleOf } from './vec.ts';
export type { Vec } from './vec.ts';
export { WHITE, BLACK, GREY, GREY_D, BLUE, BLUE_D, TEAL, GREEN, YELLOW, GOLD, RED, MAROON, PURPLE, ORANGE } from './color.ts';
export { loadFonts, shaperFor, takeMissingGlyphs } from './fonts.ts';
export type { FontName } from './fonts.ts';

// Output: SVG strings, the live DOM, text for agents
export { toSvgString, renderElements, StringSink, SnapshotSink, DomSink } from './svg.ts';
export type { ElementRecord, SvgOptions, RenderOptions } from './svg.ts';
export { renderText } from './ascii.ts';

// Time: seek, index, trace
export { NullSink, SeekSink, indexScene, stepTime, renderAt } from './timeline.ts';
export type { SceneIndex } from './timeline.ts';
export { TraceSink, traceScene } from './trace.ts';
export type { Trace, StepRecord } from './trace.ts';

// Diagnostics
export { perf } from './perf.ts';
export { MotionSink, analyzeMotion } from './verify.ts';
export type { MotionEvent, MotionOptions } from './verify.ts';

// Optional lettering: tree-shaken from scenes which do not request it.
export { MathTex, MathTex as Math } from './math.ts';
export { ItalicText } from './italic.ts';
export type { LetteringRequest, LetteringSnapshot, PackedLetteringSnapshot, StoredLetteringSnapshot, LetteringStyle } from './lettering-outlines.ts';
// End optional lettering.

export type {JsonValue, JsonObject} from './json.ts';
export type {TextShaping} from './text-context.ts';
