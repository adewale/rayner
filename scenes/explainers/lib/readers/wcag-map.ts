import { Group, Rectangle } from '../../../../src/index.ts';
import { tally, criteria } from '../wcag-map.ts';
import type { Level } from '../wcag-map.ts';
import { tile, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(level: Level, guideline: string): ReaderFrame[] {
  const total = tally('2.2', level),
    selected = criteria('2.2', level, guideline),
    focus = criteria('2.2', level).some((c) => c.num === '2.4.7');
  return [
    {
      id: 'reader-focus',
      title: 'Can you see where Tab went?',
      line: 'A concrete example: 2.4.7 Focus Visible, level AA.',
      caption: `The lower drawing marks focus on Pay. A keyboard user can identify which button will activate. Focus Visible is ${focus ? 'included' : 'not included'} at the selected level ${level}. This illustrates that criterion; conformance requires checking all applicable criteria.`,
      values: { level, focusRequired: focus },
      draw: (s) =>
        new Group(
          label('No visible focus', 0, 2.5, s.soft, 0.7),
          tile('Cancel', -3.5, 1.3, 5, 1, s),
          tile('Pay', 3.5, 1.3, 5, 1, s),
          label('Visible focus on Pay', 0, -0.2, s.palette.ink, 0.7),
          tile('Cancel', -3.5, -1.5, 5, 1, s),
          tile('Pay', 3.5, -1.5, 5, 1, s),
          new Rectangle({ width: 5.45, height: 1.45, fill: 'none', stroke: s.emphasis, strokeWidth: 0.09 }).moveTo([
            3.5, -1.5,
          ]),
        ),
    },
    {
      id: 'reader-levels',
      title: 'Does AA mean “only the AA criteria”?',
      line: `WCAG 2.2, selected level ${level}.`,
      caption: `Level ${level} includes ${total.total} success criteria in WCAG 2.2 because each level includes the levels below it. Guideline ${guideline} contributes ${selected.length} of them. A criterion count helps scope the checks; each applicable requirement still needs testing on the page.`,
      values: { level, total: total.total, guideline, count: selected.length },
      draw: (s) =>
        table(
          ['Level', 'Includes', 'WCAG 2.2'],
          [
            ['A', 'A', tally('2.2', 'A').total],
            ['AA', 'A + AA', tally('2.2', 'AA').total],
            ['AAA', 'A + AA + AAA', tally('2.2', 'AAA').total],
          ],
          s,
          { xs: [-5, -0.8, 5.4], y: 2.6, gap: 1.5 },
        ),
    },
  ];
}
