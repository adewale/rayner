import { Group, Arrow } from '../../../../src/index.ts';
import { tile, label } from '../reader-drawing.ts';
import type { StagedStep } from '../../../../explain/index.ts';
import { staged } from '../staged.ts';
export function frames(): StagedStep[] {
  // Where a logical side sits on the stage.
  const x = (side: string) => (side === 'right' ? 3.8 : -3.8);
  return [
    staged({
      id: 'reader-place',
      title: 'Will Start stay on the left?',
      line: 'An author’s task: reuse a two-panel layout in RTL.',
      caption:
        'With direction rtl, logical Start moves to the right and End to the left. Physical Left and Right keep their coordinates. Choose logical regions when panels should follow the stage direction, or physical regions when a diagram must stay on a particular side. This does not reverse the text inside a panel.',
      state: { direction: 'rtl', start: 'right', end: 'left' },
      draw: (st, s) =>
        new Group(
          tile('End', x(st.end), 1.6, 6.3, 1.2, s),
          tile('Start', x(st.start), 1.6, 6.3, 1.2, s, { active: true }),
          // From Start towards End: the way the panels follow each other.
          new Arrow([Math.sign(x(st.start)) * 6, -0.4], [Math.sign(x(st.end)) * 6, -0.4], { stroke: s.emphasis, strokeWidth: 0.05, tipLength: 0.2, tipWidth: 0.16 }),
          label(`stage(scene, {direction: '${st.direction}'})`, 0, -2.2, s.palette.ink, 0.7),
        ),
    }),
    staged({
      id: 'reader-fields',
      title: 'Does RTL reverse the value 123?',
      line: 'Panel position and field order are separate settings.',
      caption:
        'The RTL card puts the field name to the right of its value. The LTR override puts the name on the left. Both keep the digit order 123. The following cards update that value without moving its column.',
      state: { digits: '123', rtl: ['123', 'Field'], ltr: ['Field', '123'] },
      draw: (st, s) =>
        new Group(
          label('RTL columns', 0, 2.5, s.soft, 0.7),
          tile(st.rtl[0]!, -3.5, 1.5, 5, 1.2, s),
          tile(st.rtl[1]!, 3.5, 1.5, 5, 1.2, s),
          label('LTR override', 0, -0.3, s.soft, 0.7),
          tile(st.ltr[0]!, -3.5, -1.7, 5, 1.2, s),
          tile(st.ltr[1]!, 3.5, -1.7, 5, 1.2, s),
        ),
    }),
  ];
}
