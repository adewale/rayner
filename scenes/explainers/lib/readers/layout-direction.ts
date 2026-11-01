import { Group, Arrow } from '../../../../src/index.ts';
import { tile, label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(): ReaderFrame[] {
  return [
    {
      id: 'reader-place',
      title: 'Will Start stay on the left?',
      line: 'An author’s task: reuse a two-panel layout in RTL.',
      caption:
        'With direction rtl, logical Start moves to the right and End to the left. Physical Left and Right keep their coordinates. Logical regions follow reading order; physical regions keep a diagram tied to a particular side.',
      values: { direction: 'rtl', start: 'right', end: 'left' },
      draw: (s) =>
        new Group(
          tile('End', -3.8, 1.6, 6.3, 1.2, s),
          tile('Start', 3.8, 1.6, 6.3, 1.2, s, { active: true }),
          new Arrow([6, -0.4], [-6, -0.4], { stroke: s.emphasis, strokeWidth: 0.05, tipLength: 0.2, tipWidth: 0.16 }),
          label("stage(scene, {direction: 'rtl'})", 0, -2.2, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-fields',
      title: 'Does RTL reverse the value 123?',
      line: 'Panel position and field order are separate settings.',
      caption:
        'The RTL card puts the field name to the right of its value. The LTR override puts the name on the left. Both keep the digit order 123. The following cards update that value without moving its column.',
      values: { digits: '123', rtl: ['123', 'Field'], ltr: ['Field', '123'] },
      draw: (s) =>
        new Group(
          label('RTL columns', 0, 2.5, s.soft, 0.7),
          tile('123', -3.5, 1.5, 5, 1.2, s),
          tile('Field', 3.5, 1.5, 5, 1.2, s),
          label('LTR override', 0, -0.3, s.soft, 0.7),
          tile('Field', -3.5, -1.7, 5, 1.2, s),
          tile('123', 3.5, -1.7, 5, 1.2, s),
        ),
    },
  ];
}
