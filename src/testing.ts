// The engine's half of rayner/testing (explain/testing.ts re-exports it): traces, frame checks,
// view and machine inspection, fonts and profiling, for an author's tests and tools rather than
// scenes. Not an entry point of its own.

export { TraceSink, traceScene } from './trace.ts';
export type { Trace, StepRecord } from './trace.ts';
export { MotionSink, analyzeMotion, InvariantSink } from './verify.ts';
export type { MotionEvent, MotionOptions, InvariantFailure } from './verify.ts';
export { jsonObject } from './json.ts';
export { loadFonts, takeMissingGlyphs } from './fonts.ts';
export { perf } from './perf.ts';
