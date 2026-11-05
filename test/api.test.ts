// The public API is the set of names src/index.ts exports. This pins it, so a
// name cannot leave or appear without a deliberate change here (and a
// changelog entry). Internals stay internal by construction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.ts';

const EXPECTED = [
  // model
  'Mobject', 'Group', 'VMobject',
  'Arc', 'ArcBetweenPoints', 'Arrow', 'Circle', 'CurvedArrow', 'Dot', 'Labeled', 'Line', 'Polygon', 'Rectangle', 'Square',
  'Text', 'Math', 'MathTex', 'ItalicText', 'DecimalNumber', 'Code', 'StateReadout',
  'NumberLine', 'Axes',
  'View', 'view', 'viewMismatch',
  // motion
  'Animation', 'Transform', 'FadeIn', 'FadeOut', 'Create', 'Write', 'Indicate', 'Flash', 'MoveAlongPath', 'AnimationGroup', 'LaggedStart',
  'Restore', 'TransformFromCopy', 'Succession',
  'GrowFromEdge', 'PulseAlongPath', 'SetState', 'Follow', 'Machine', 'machinesOf', 'refuse', 'isRefusal',
  'TransformMatching', 'TransformMatchingShapes', 'TransformMatchingText', 'matchByKey',
  'TransformDiff', 'diffLines', 'parseUnifiedDiff',
  'linear', 'smooth', 'rushInto', 'rushFrom', 'thereAndBack',
  'Scene', 'StopScene',
  'Frame',
  // vocabulary
  'choreograph',
  'lerpColor',
  'loadFonts', 'shaperFor', 'takeMissingGlyphs', 'jsonObject',
  // output
  'toSvgString', 'renderElements', 'StringSink', 'SnapshotSink', 'DomSink', 'renderText',
  // time
  'NullSink', 'SeekSink', 'indexScene', 'stepTime', 'renderAt', 'TraceSink', 'traceScene',
  // diagnostics
  'perf', 'MotionSink', 'analyzeMotion', 'InvariantSink',
  // emphasis that stays
  'SurroundingRectangle', 'Underline', 'Cross', 'Brace', 'BraceLabel', 'Circumscribe',
].sort();

test('the public API is exactly this set of names', () => {
  assert.deepEqual(Object.keys(api).sort(), EXPECTED);
});
