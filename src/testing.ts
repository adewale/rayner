// The engine's half of rayner/testing (explain/testing.ts re-exports it): traces, frame checks,
// view and machine inspection and fonts, for an author's tests and tools rather than
// scenes. Not an entry point of its own.

export { TraceSink, traceScene } from './trace.ts';
export type { Trace, StepRecord, TraceOf, TraceSinkOptions } from './trace.ts';
export type { Jsonified } from './json.ts';
export { MotionSink, analyzeMotion, InvariantSink } from './verify.ts';
export type { MotionEvent, InvariantFailure } from './verify.ts';
export { jsonObject } from './json.ts';
export { loadFonts, takeMissingGlyphs } from './fonts.ts';
