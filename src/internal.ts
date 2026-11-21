// The engine's internal interface: what the player (app/), the rayner command (tools/) and diagram
// capture (integrations/) import from src/ that no entry point exports. They import the engine through
// its entry points and this module only (test/layers.test.ts), so every name they depend on beyond the
// public API is listed here, where a change to it can be seen. Not an entry point: the package does not
// export it, and the command reaches it by its private specifier (docs/ENGINE.md, "Layers").
export { center, contains, intersect, nonempty, overlaps, pad, pointsBox, unionBoxes } from './box.ts';
export { contrastRatio, isHex } from './color.ts';
export { FALLBACK, MONO, SANS } from './font-data.ts';
export { embeddedFaces } from './fonts.ts';
export { canonicalJson, cloneJson, jsonObject } from './json.ts';
export { LETTERING_VERSION, RTL_SCRIPTS, SUBSET_LETTERING_VERSION, bindLettering, cutFace, defaultCutFace, letteringOf, numericAlphabet, packLettering, pinnedFor, requestCuts, runKey, scaledRun, scriptCuts, scriptFaceNames, snapshotProvider, unpackLettering, usesLettering, usesOutlineLettering, withSceneLettering } from './lettering-outlines.ts';
export type { LetteringCut, LetteringProvider, LetteringSnapshot, PackedLetteringSnapshot, StoredLetteringSnapshot } from './lettering-outlines.ts';
export { LETTERING_SCRIPTS } from './lettering-scripts.ts';
export { takeLetteringMissing, takeLetteringUse, useLettering, withLettering } from './lettering.ts';
export type { LetteringFaces, LetteringScript, SubsetLetteringRequest } from './lettering.ts';
export { affine, mobjectId, paints, paintsStroke } from './mobject.ts';
export { StopScene } from './scene.ts';
export { DomSink, SnapshotSink, VIEWBOX, applyRecords, atHome, clipPathOf, renderElements, serializeElement, userBox, viewOf } from './svg.ts';
export type { ElementRecord } from './svg.ts';
export { textContextOf } from './text-context.ts';
export { NullSink, dryRun } from './timeline.ts';
export { traceRun } from './trace.ts';
export { InvariantSink, MotionSink, analyzeMotion } from './verify.ts';
export { KeyedMotionSink, keyedMotionLine } from './keyed-motion.ts';
export { FRAME, STAGE_BOX, UNITS, zoomOf } from './units.ts';
