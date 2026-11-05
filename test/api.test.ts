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
  'Text', 'MathTex', 'ItalicText', 'DecimalNumber', 'Code', 'StateReadout',
  'NumberLine', 'Axes',
  'View', 'view',
  // motion
  'Animation', 'Transform', 'FadeIn', 'FadeOut', 'Create', 'Write', 'MoveAlongPath', 'AnimationGroup', 'LaggedStart',
  'Restore', 'TransformFromCopy', 'Succession',
  'GrowFromEdge', 'PulseAlongPath', 'SetState', 'Follow', 'Machine', 'refuse', 'isRefusal',
  'TransformMatching', 'TransformMatchingShapes', 'TransformMatchingText', 'matchByKey',
  'TransformDiff', 'diffLines', 'parseUnifiedDiff',
  'linear', 'smooth', 'rushInto', 'rushFrom', 'thereAndBack',
  'Scene',
  'Frame',
  // vocabulary
  'choreograph',
  'lerpColor',
  'shaperFor',
  // emphasis that stays
  'SurroundingRectangle', 'Underline', 'Cross', 'Brace', 'BraceLabel', 'Circumscribe',
].sort();

test('the public API is exactly this set of names', () => {
  assert.deepEqual(Object.keys(api).sort(), EXPECTED);
});
