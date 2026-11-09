// The engine's half of rayner/testing (explain/testing.ts re-exports it): traces, frame checks
// and fonts, for an author's tests and tools rather than scenes. Not an entry point of its own.

export { TraceSink, traceScene } from './trace.ts';
export type { Trace, StepRecord, TraceOf, TraceSinkOptions } from './trace.ts';
export type { Jsonified } from './json.ts';
export { InvariantSink } from './verify.ts';
export type { InvariantFailure } from './verify.ts';
export { jsonObject } from './json.ts';
export { loadFonts } from './fonts.ts';
